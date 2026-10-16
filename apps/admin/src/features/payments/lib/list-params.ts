import { inValues } from '@nile/api';
import {
  cairoDayBounds,
  isCalendarDay,
  REFUND_REASONS,
  type RefundReason,
  type RefundStatus,
} from '@nile/domain';

// AD-16 filters, URL ⇄ API: `?status=recorded&reason=a,b&from=&to=`. Invalid values are dropped, never sent
// (R-28). No status is "To record", the work queue, oldest first (the backend default, sent explicitly).

export const REFUND_LIST_PARAMS = { status: 'status', reason: 'reason', from: 'from', to: 'to' } as const;
const REASON_SEPARATOR = ',';

export interface RefundFilters {
  readonly status: RefundStatus;
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
  const reasons = new Set(single(params[REFUND_LIST_PARAMS.reason])?.split(REASON_SEPARATOR) ?? []);
  const from = day(single(params[REFUND_LIST_PARAMS.from]));
  const to = day(single(params[REFUND_LIST_PARAMS.to]));
  return {
    status: single(params[REFUND_LIST_PARAMS.status]) === 'recorded' ? 'recorded' : 'pending_manual',
    reasons: REFUND_REASONS.filter((reason) => reasons.has(reason)),
    from,
    // A range that ends before it starts is dropped as a whole end.
    to: from !== null && to !== null && to < from ? null : to,
  };
}

/** The query string for filters (no `?`): the default "To record" tab has no `status`. */
export function refundFiltersQuery(filters: RefundFilters): string {
  const query = new URLSearchParams();
  if (filters.status === 'recorded') query.set(REFUND_LIST_PARAMS.status, filters.status);
  if (filters.reasons.length > 0)
    query.set(REFUND_LIST_PARAMS.reason, filters.reasons.join(REASON_SEPARATOR));
  if (filters.from !== null) query.set(REFUND_LIST_PARAMS.from, filters.from);
  if (filters.to !== null) query.set(REFUND_LIST_PARAMS.to, filters.to);
  return query.toString();
}

/** The API query (literal filter keys): To record oldest first, Recorded newest first (spec 03 AD-16). */
export function refundApiQuery(filters: RefundFilters) {
  return {
    sort: filters.status === 'pending_manual' ? ('createdAt' as const) : ('-createdAt' as const),
    'status[eq]': filters.status,
    ...(filters.reasons.length === 0 ? {} : { 'reason[in]': inValues(filters.reasons) }),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
    ...(filters.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(filters.to).end }),
  };
}

export const hasNarrowingFilters = (filters: RefundFilters): boolean =>
  filters.reasons.length > 0 || filters.from !== null || filters.to !== null;
