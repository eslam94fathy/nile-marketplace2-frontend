import { inValues } from '@nile/api';
import { cairoDayBounds, isCalendarDay, type OrderStatus } from '@nile/domain';
import { z } from 'zod';

// AD-14 filters, URL ⇄ API: `?status=<tab>&number=&customer=&from=&to=`, newest first. Invalid values are
// dropped, never sent (R-28). Tabs are the storefront SF-17 groups; no tab is "All" (as SF-17).

export const ORDER_LIST_PARAMS = {
  status: 'status',
  number: 'number',
  customer: 'customer',
  from: 'from',
  to: 'to',
} as const;

/** Spec 01 SF-17 groups, in order (null = every status). */
export const ORDER_TABS = {
  all: null,
  'awaiting-payment': ['pending_payment'],
  'in-progress': ['placed', 'in_progress'],
  completed: ['completed', 'partially_completed'],
  cancelled: ['cancelled'],
} as const satisfies Readonly<Record<string, readonly OrderStatus[] | null>>;

export type OrderTab = keyof typeof ORDER_TABS;
export const DEFAULT_ORDER_TAB: OrderTab = 'all';
/** Order numbers are short codes; anything longer can't match and isn't sent. */
export const ORDER_NUMBER_MAX = 40;

export interface OrderFilters {
  readonly tab: OrderTab;
  /** Exact order number (`orderNumber[eq]`). */
  readonly orderNumber: string | null;
  readonly customerId: string | null;
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

export type RawOrderParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);
const isTab = (value: string | undefined): value is OrderTab =>
  value !== undefined && Object.hasOwn(ORDER_TABS, value);

export function parseOrderFilters(params: RawOrderParams): OrderFilters {
  const tab = single(params[ORDER_LIST_PARAMS.status]);
  const orderNumber = single(params[ORDER_LIST_PARAMS.number])?.trim();
  const customer = single(params[ORDER_LIST_PARAMS.customer]);
  const from = day(single(params[ORDER_LIST_PARAMS.from]));
  const to = day(single(params[ORDER_LIST_PARAMS.to]));
  return {
    tab: isTab(tab) ? tab : DEFAULT_ORDER_TAB,
    orderNumber:
      orderNumber !== undefined && orderNumber.length >= 1 && orderNumber.length <= ORDER_NUMBER_MAX
        ? orderNumber
        : null,
    customerId: z.uuid().safeParse(customer).success ? (customer ?? null) : null,
    from,
    // A range that ends before it starts is dropped as a whole end.
    to: from !== null && to !== null && to < from ? null : to,
  };
}

/** The query string for filters (no `?`): the default All tab has no `status`. */
export function orderFiltersQuery(filters: OrderFilters): string {
  const query = new URLSearchParams();
  if (filters.tab !== DEFAULT_ORDER_TAB) query.set(ORDER_LIST_PARAMS.status, filters.tab);
  if (filters.orderNumber !== null) query.set(ORDER_LIST_PARAMS.number, filters.orderNumber);
  if (filters.customerId !== null) query.set(ORDER_LIST_PARAMS.customer, filters.customerId);
  if (filters.from !== null) query.set(ORDER_LIST_PARAMS.from, filters.from);
  if (filters.to !== null) query.set(ORDER_LIST_PARAMS.to, filters.to);
  return query.toString();
}

/** A status filter as the API takes it: one value with `[eq]`, several with `[in]`. */
function statusQuery(statuses: readonly OrderStatus[] | null) {
  if (statuses === null) return {};
  const [first] = statuses;
  return statuses.length === 1 && first !== undefined
    ? { 'status[eq]': first }
    : { 'status[in]': inValues(statuses) };
}

/** The API query (literal filter keys), newest first (spec 03 AD-14). */
export function orderApiQuery(filters: OrderFilters) {
  return {
    sort: '-createdAt' as const,
    ...statusQuery(ORDER_TABS[filters.tab]),
    ...(filters.orderNumber === null ? {} : { 'orderNumber[eq]': filters.orderNumber }),
    ...(filters.customerId === null ? {} : { 'customerId[eq]': filters.customerId }),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
    ...(filters.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(filters.to).end }),
  };
}

export const hasNarrowingFilters = (filters: OrderFilters): boolean =>
  filters.orderNumber !== null || filters.customerId !== null || filters.from !== null || filters.to !== null;
