import { inValues } from '@nile/api';
import { RETURN_REASONS, type ReturnReason, type ReturnStatus } from '@nile/domain';
import * as z from 'zod';

// AD-32 tabs and filters, URL ⇄ API: `?tab=&reason=&seller=&customer=` (spec 03 AD-32). `reason` is a comma list
// (`reason[in]`); `customer` was fixed by the AD-26 link (design 01 R-78). Invalid values are dropped, never sent
// (R-28).

export const RETURN_LIST_PARAMS = {
  tab: 'tab',
  reason: 'reason',
  seller: 'seller',
  customer: 'customer',
} as const;

/** Spec 03 AD-32 tabs, in order, with the statuses each one lists (null = every status). */
export const RETURN_TABS = {
  'needs-decision': ['escalated', 'disputed'],
  'waiting-seller': ['requested'],
  'in-progress': ['approved', 'picked_up', 'received', 'rejected'],
  closed: ['completed', 'refused', 'cancelled', 'pickup_failed'],
  all: null,
} as const satisfies Readonly<Record<string, readonly ReturnStatus[] | null>>;

export type ReturnTab = keyof typeof RETURN_TABS;
export const RETURN_TAB_KEYS = Object.keys(RETURN_TABS) as ReturnTab[];
export const DEFAULT_RETURN_TAB: ReturnTab = 'needs-decision';

/** The tab that lists a status (AD-02 "Open returns" figures link to it). */
export function returnTabOf(status: ReturnStatus): ReturnTab {
  return (
    RETURN_TAB_KEYS.find((tab) => (RETURN_TABS[tab] as readonly ReturnStatus[] | null)?.includes(status)) ??
    'all'
  );
}

export interface ReturnFilters {
  readonly tab: ReturnTab;
  readonly reasons: readonly ReturnReason[];
  readonly sellerId: string | null;
  readonly customerId: string | null;
}

export type RawReturnParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const LIST_SEPARATOR = ',';
const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const uuid = (value: string | undefined) => (z.uuid().safeParse(value).success ? (value ?? null) : null);
const isTab = (value: string | undefined): value is ReturnTab =>
  value !== undefined && Object.hasOwn(RETURN_TABS, value);

export function parseReturnFilters(params: RawReturnParams): ReturnFilters {
  const tab = single(params[RETURN_LIST_PARAMS.tab]);
  const reasons = (single(params[RETURN_LIST_PARAMS.reason]) ?? '').split(LIST_SEPARATOR);
  return {
    tab: isTab(tab) ? tab : DEFAULT_RETURN_TAB,
    // Kept in the enum's order, each once.
    reasons: RETURN_REASONS.filter((reason) => reasons.includes(reason)),
    sellerId: uuid(single(params[RETURN_LIST_PARAMS.seller])),
    customerId: uuid(single(params[RETURN_LIST_PARAMS.customer])),
  };
}

/** The query string for filters (no `?`): the default tab has no `tab`. */
export function returnFiltersQuery(filters: ReturnFilters): string {
  const query = new URLSearchParams();
  if (filters.tab !== DEFAULT_RETURN_TAB) query.set(RETURN_LIST_PARAMS.tab, filters.tab);
  if (filters.reasons.length > 0) query.set(RETURN_LIST_PARAMS.reason, filters.reasons.join(LIST_SEPARATOR));
  if (filters.sellerId !== null) query.set(RETURN_LIST_PARAMS.seller, filters.sellerId);
  if (filters.customerId !== null) query.set(RETURN_LIST_PARAMS.customer, filters.customerId);
  return query.toString();
}

/** One value with `[eq]`, several with `[in]` (the same shape for statuses and reasons). */
function statusQuery(statuses: readonly ReturnStatus[] | null) {
  const [first] = statuses ?? [];
  if (statuses === null || first === undefined) return {};
  return statuses.length === 1 ? { 'status[eq]': first } : { 'status[in]': inValues(statuses) };
}

function reasonQuery(reasons: readonly ReturnReason[]) {
  const [first] = reasons;
  if (first === undefined) return {};
  return reasons.length === 1 ? { 'reason[eq]': first } : { 'reason[in]': inValues(reasons) };
}

/** The API query (literal filter keys), newest first (spec 03 AD-32). */
export function returnApiQuery(filters: ReturnFilters) {
  return {
    sort: '-createdAt' as const,
    ...statusQuery(RETURN_TABS[filters.tab]),
    ...reasonQuery(filters.reasons),
    ...(filters.sellerId === null ? {} : { 'sellerId[eq]': filters.sellerId }),
    ...(filters.customerId === null ? {} : { 'customerId[eq]': filters.customerId }),
  };
}

export const hasReturnFilters = (filters: ReturnFilters): boolean =>
  filters.reasons.length > 0 || filters.sellerId !== null || filters.customerId !== null;
