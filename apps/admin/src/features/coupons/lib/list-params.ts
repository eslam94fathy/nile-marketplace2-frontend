import { COUPON_FUNDINGS, COUPON_STATUSES, type CouponFunding, type CouponStatus } from '@nile/domain';
import * as z from 'zod';
import { COUPON_CODE_PATTERN } from './form';

// AD-35 filters, URL ⇄ API: `?funding=&status=&seller=&code=` (spec 03 AD-35). `status` is the coupon's own
// switch (`status[eq]`, active / inactive), as SE-21; `code` is matched exactly, upper-cased. `seller` comes from
// the AD-05 "Coupons" link (TM9-Q4). Invalid values are dropped, never sent (R-28).

export const COUPON_LIST_PARAMS = {
  funding: 'funding',
  status: 'status',
  seller: 'seller',
  code: 'code',
} as const;

export interface CouponFilters {
  readonly funding: CouponFunding | null;
  readonly status: CouponStatus | null;
  readonly sellerId: string | null;
  readonly code: string | null;
}

export type RawCouponParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const uuid = (value: string | undefined) => (z.uuid().safeParse(value).success ? (value ?? null) : null);

/** A typed code as the API stores it: trimmed and upper-cased; null unless it can be a code. */
export function normaliseCode(value: string | undefined): string | null {
  const code = value?.trim().toUpperCase() ?? '';
  return COUPON_CODE_PATTERN.test(code) ? code : null;
}

export function parseCouponFilters(params: RawCouponParams): CouponFilters {
  const funding = single(params[COUPON_LIST_PARAMS.funding]);
  const status = single(params[COUPON_LIST_PARAMS.status]);
  return {
    funding: COUPON_FUNDINGS.find((value) => value === funding) ?? null,
    status: COUPON_STATUSES.find((value) => value === status) ?? null,
    sellerId: uuid(single(params[COUPON_LIST_PARAMS.seller])),
    code: normaliseCode(single(params[COUPON_LIST_PARAMS.code])),
  };
}

/** The query string for filters (no `?`). */
export function couponFiltersQuery(filters: CouponFilters): string {
  const query = new URLSearchParams();
  if (filters.funding !== null) query.set(COUPON_LIST_PARAMS.funding, filters.funding);
  if (filters.status !== null) query.set(COUPON_LIST_PARAMS.status, filters.status);
  if (filters.sellerId !== null) query.set(COUPON_LIST_PARAMS.seller, filters.sellerId);
  if (filters.code !== null) query.set(COUPON_LIST_PARAMS.code, filters.code);
  return query.toString();
}

/** The API query (literal filter keys), newest first (the backend default, sent explicitly). */
export function couponApiQuery(filters: CouponFilters) {
  return {
    sort: '-createdAt' as const,
    ...(filters.funding === null ? {} : { 'funding[eq]': filters.funding }),
    ...(filters.status === null ? {} : { 'status[eq]': filters.status }),
    ...(filters.sellerId === null ? {} : { 'sellerId[eq]': filters.sellerId }),
    ...(filters.code === null ? {} : { 'code[eq]': filters.code }),
  };
}

export const NO_COUPON_FILTERS: CouponFilters = { funding: null, status: null, sellerId: null, code: null };

export const hasCouponFilters = (filters: CouponFilters): boolean =>
  Object.values(filters).some((value) => value !== null);
