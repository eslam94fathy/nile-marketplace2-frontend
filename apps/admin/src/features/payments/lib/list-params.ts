import { inValues } from '@nile/api';
import {
  cairoDayBounds,
  isCalendarDay,
  REFUND_REASONS,
  REFUND_STATUSES,
  type RefundReason,
  type RefundStatus,
} from '@nile/domain';

// AD-16 filters, URL ⇄ API: `?status=<tab>&reason=a,b&from=&to=` (spec 03 AD-16, T-M8). The tab is a refund
// status or `all`; invalid values are dropped, never sent (R-28). No status is "Needs action" (`pending_manual`,
// AD-Q-14), the work queue, oldest first; the other tabs newest first (TM8-Q2).

export const REFUND_LIST_PARAMS = { status: 'status', reason: 'reason', from: 'from', to: 'to' } as const;
const REASON_SEPARATOR = ',';

/** Spec 03 AD-16 tabs, in order. */
export const REFUND_TABS = [
  'pending_manual',
  'pending_auto',
  'processing',
  'succeeded',
  'recorded',
  'all',
] as const satisfies readonly (RefundStatus | 'all')[];
export type RefundTab = (typeof REFUND_TABS)[number];
export const DEFAULT_REFUND_TAB: RefundTab = 'pending_manual';

export interface RefundFilters {
  readonly status: RefundTab;
  /** Empty = every reason. Kept in `REFUND_REASONS` order, so equal filters give equal keys. */
  readonly reasons: readonly RefundReason[];
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

export type RawRefundParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);

export function parseRefundFilters(params: RawRefundParams): RefundFilters {
  const status = single(params[REFUND_LIST_PARAMS.status]);
  const reasons = new Set(single(params[REFUND_LIST_PARAMS.reason])?.split(REASON_SEPARATOR) ?? []);
  const from = day(single(params[REFUND_LIST_PARAMS.from]));
  const to = day(single(params[REFUND_LIST_PARAMS.to]));
  return {
    status: REFUND_TABS.find((tab) => tab === status) ?? DEFAULT_REFUND_TAB,
    reasons: REFUND_REASONS.filter((reason) => reasons.has(reason)),
    from,
    // A range that ends before it starts is dropped as a whole end.
    to: from !== null && to !== null && to < from ? null : to,
  };
}

/** The query string for filters (no `?`): the default "Needs action" tab has no `status`. */
export function refundFiltersQuery(filters: RefundFilters): string {
  const query = new URLSearchParams();
  if (filters.status !== DEFAULT_REFUND_TAB) query.set(REFUND_LIST_PARAMS.status, filters.status);
  if (filters.reasons.length > 0)
    query.set(REFUND_LIST_PARAMS.reason, filters.reasons.join(REASON_SEPARATOR));
  if (filters.from !== null) query.set(REFUND_LIST_PARAMS.from, filters.from);
  if (filters.to !== null) query.set(REFUND_LIST_PARAMS.to, filters.to);
  return query.toString();
}

/** The API query (literal filter keys): one status at a time [VERIFIED backend route]. */
export function refundApiQuery(filters: RefundFilters) {
  const status = REFUND_STATUSES.find((value) => value === filters.status);
  return {
    sort: filters.status === DEFAULT_REFUND_TAB ? ('createdAt' as const) : ('-createdAt' as const),
    ...(status === undefined ? {} : { 'status[eq]': status }),
    ...(filters.reasons.length === 0 ? {} : { 'reason[in]': inValues(filters.reasons) }),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
    ...(filters.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(filters.to).end }),
  };
}

export const hasNarrowingFilters = (filters: RefundFilters): boolean =>
  filters.reasons.length > 0 || filters.from !== null || filters.to !== null;
