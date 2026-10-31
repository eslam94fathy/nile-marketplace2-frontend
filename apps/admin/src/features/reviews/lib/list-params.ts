import { REVIEW_STATUSES, type ReviewStatus } from '@nile/domain';
import * as z from 'zod';

// AD-30 filters, URL ⇄ API: `?status=&rating=&product=&seller=&customer=` (spec 03 AD-30). `rating=n` means
// "n stars or fewer" (`rating[lte]`). The parameter names `product` and `customer` were fixed by the AD-27 and
// AD-26 links (design 01 R-78, R-80). Invalid values are dropped, never sent (R-28). The snapshot documents no
// `createdAt` filter on this list (OQ-21), so there is no date range yet.

export const REVIEW_LIST_PARAMS = {
  status: 'status',
  rating: 'rating',
  product: 'product',
  seller: 'seller',
  customer: 'customer',
} as const;

/** "5 stars or fewer" is every review, so the choices stop at 4. */
export const RATING_CEILINGS = [4, 3, 2, 1] as const;
export type RatingCeiling = (typeof RATING_CEILINGS)[number];

export interface ReviewFilters {
  readonly status: ReviewStatus | null;
  readonly rating: RatingCeiling | null;
  readonly productId: string | null;
  readonly sellerId: string | null;
  readonly customerId: string | null;
}

export type RawReviewParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const uuid = (value: string | undefined) => (z.uuid().safeParse(value).success ? (value ?? null) : null);

export function parseReviewFilters(params: RawReviewParams): ReviewFilters {
  const status = single(params[REVIEW_LIST_PARAMS.status]);
  const rating = single(params[REVIEW_LIST_PARAMS.rating]);
  return {
    status: REVIEW_STATUSES.find((value) => value === status) ?? null,
    rating: RATING_CEILINGS.find((value) => String(value) === rating) ?? null,
    productId: uuid(single(params[REVIEW_LIST_PARAMS.product])),
    sellerId: uuid(single(params[REVIEW_LIST_PARAMS.seller])),
    customerId: uuid(single(params[REVIEW_LIST_PARAMS.customer])),
  };
}

/** The query string for filters (no `?`). */
export function reviewFiltersQuery(filters: ReviewFilters): string {
  const query = new URLSearchParams();
  if (filters.status !== null) query.set(REVIEW_LIST_PARAMS.status, filters.status);
  if (filters.rating !== null) query.set(REVIEW_LIST_PARAMS.rating, String(filters.rating));
  if (filters.productId !== null) query.set(REVIEW_LIST_PARAMS.product, filters.productId);
  if (filters.sellerId !== null) query.set(REVIEW_LIST_PARAMS.seller, filters.sellerId);
  if (filters.customerId !== null) query.set(REVIEW_LIST_PARAMS.customer, filters.customerId);
  return query.toString();
}

/** The API query (literal filter keys); the backend's default order is newest first. */
export function reviewApiQuery(filters: ReviewFilters) {
  return {
    ...(filters.status === null ? {} : { 'status[eq]': filters.status }),
    ...(filters.rating === null ? {} : { 'rating[lte]': filters.rating }),
    ...(filters.productId === null ? {} : { 'productId[eq]': filters.productId }),
    ...(filters.sellerId === null ? {} : { 'sellerId[eq]': filters.sellerId }),
    ...(filters.customerId === null ? {} : { 'customerId[eq]': filters.customerId }),
  };
}

export const NO_REVIEW_FILTERS: ReviewFilters = {
  status: null,
  rating: null,
  productId: null,
  sellerId: null,
  customerId: null,
};

export const hasReviewFilters = (filters: ReviewFilters): boolean =>
  Object.values(filters).some((value) => value !== null);
