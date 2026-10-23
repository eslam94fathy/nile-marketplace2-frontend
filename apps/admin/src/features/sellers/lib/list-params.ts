import { cairoDayBounds, isCalendarDay, SELLER_STATUSES, type SellerStatus } from '@nile/domain';
import * as z from 'zod';

// AD-04 filters, URL ⇄ API: `?status=&name=&governorate=&from=&to=`. Invalid values are dropped, never sent
// (R-28). No status is the "Pending" tab (the work queue, oldest first: decided 2026-10-15, as seller orders);
// `status=all` is every status.

export const SELLER_LIST_PARAMS = {
  status: 'status',
  name: 'name',
  governorate: 'governorate',
  from: 'from',
  to: 'to',
} as const;

export const ALL_STATUSES = 'all';
export const NAME_FILTER_MAX = 150;

export interface SellerFilters {
  /** null = all statuses. */
  readonly status: SellerStatus | null;
  readonly name: string | null;
  readonly governorateId: string | null;
  /** Cairo calendar days `YYYY-MM-DD`, inclusive. */
  readonly from: string | null;
  readonly to: string | null;
}

export type RawSellerParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);

export function parseSellerFilters(params: RawSellerParams): SellerFilters {
  const status = single(params[SELLER_LIST_PARAMS.status]);
  const name = single(params[SELLER_LIST_PARAMS.name])?.trim();
  const governorate = single(params[SELLER_LIST_PARAMS.governorate]);
  const from = day(single(params[SELLER_LIST_PARAMS.from]));
  const to = day(single(params[SELLER_LIST_PARAMS.to]));
  return {
    status:
      status === ALL_STATUSES
        ? null
        : (SELLER_STATUSES as readonly string[]).includes(status ?? '')
          ? (status as SellerStatus)
          : 'pending_approval',
    name: name !== undefined && name.length >= 1 && name.length <= NAME_FILTER_MAX ? name : null,
    governorateId: z.uuid().safeParse(governorate).success ? (governorate ?? null) : null,
    from,
    // A range that ends before it starts is dropped as a whole end.
    to: from !== null && to !== null && to < from ? null : to,
  };
}

/** The query string for filters (no `?`): the default Pending tab has no `status`. */
export function sellerFiltersQuery(filters: SellerFilters): string {
  const query = new URLSearchParams();
  if (filters.status === null) query.set(SELLER_LIST_PARAMS.status, ALL_STATUSES);
  else if (filters.status !== 'pending_approval') query.set(SELLER_LIST_PARAMS.status, filters.status);
  if (filters.name !== null) query.set(SELLER_LIST_PARAMS.name, filters.name);
  if (filters.governorateId !== null) query.set(SELLER_LIST_PARAMS.governorate, filters.governorateId);
  if (filters.from !== null) query.set(SELLER_LIST_PARAMS.from, filters.from);
  if (filters.to !== null) query.set(SELLER_LIST_PARAMS.to, filters.to);
  return query.toString();
}

/** The API query (literal filter keys). Pending: oldest first [PROPOSED in spec 03]; others newest first. */
export function sellerApiQuery(filters: SellerFilters) {
  return {
    sort: filters.status === 'pending_approval' ? ('createdAt' as const) : ('-createdAt' as const),
    ...(filters.status === null ? {} : { 'status[eq]': filters.status }),
    ...(filters.name === null ? {} : { 'businessName[like]': filters.name }),
    ...(filters.governorateId === null ? {} : { 'pickupGovernorateId[eq]': filters.governorateId }),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
    ...(filters.to === null ? {} : { 'createdAt[lte]': cairoDayBounds(filters.to).end }),
  };
}

export const hasNarrowingFilters = (filters: SellerFilters): boolean =>
  filters.name !== null || filters.governorateId !== null || filters.from !== null || filters.to !== null;
