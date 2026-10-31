import { inValues, unwrap, type ApiClient, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';

// Product reviews (design 02 §2.2 `reviews.summary(productId)`, `reviews.list(productId, params)`). Every key
// starts with `['storefront', 'reviews']` (`reviewKeys.all`), which writing a review (T-K5) invalidates.

export type Review = Schema<'ReviewDto'>;
export type RatingSummary = Schema<'RatingSummaryDto'>;

/** Anchor of the reviews section; the rating under the product name links here (spec 01 §10.3 item 2). */
export const REVIEWS_SECTION_ID = 'reviews';

const SUMMARY_STALE_TIME_MS = 5 * 60_000;
const LIST_STALE_TIME_MS = 60_000;
/** Spec 01 SF-Q-15: 5 first, then 10 per "Show more reviews" (the cursor carries only the sort [VERIFIED]). */
export const FIRST_PAGE_SIZE = 5;
export const NEXT_PAGE_SIZE = 10;

/** URL-free filter state of the section; values map one to one onto the API (spec 01 SF-05-R). */
export const REVIEW_SORTS = {
  newest: '-createdAt',
  'highest-rated': '-rating',
  'lowest-rated': 'rating',
} as const;
export type ReviewSort = keyof typeof REVIEW_SORTS;

export interface ReviewFilters {
  /** Star values shown (`rating[in]`); empty means all. Kept sorted so equal filters share a key. */
  readonly ratings: readonly number[];
  readonly withPhotos: boolean;
  readonly sort: ReviewSort;
}

export const DEFAULT_REVIEW_FILTERS: ReviewFilters = { ratings: [], withPhotos: false, sort: 'newest' };

export const reviewKeys = {
  all: () => ['storefront', 'reviews'] as const,
  summary: (productId: string) => queryKey('storefront', 'reviews', 'summary', { productId }),
  list: (productId: string, filters: ReviewFilters) =>
    queryKey('storefront', 'reviews', 'list', { productId, ...filters }),
};

export function reviewSummaryOptions(api: ApiClient, productId: string) {
  return queryOptions({
    queryKey: reviewKeys.summary(productId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          api.GET('/api/v1/products/{productId}/reviews/summary', {
            params: { path: { productId } },
            signal,
          }),
        )
      ).data,
    staleTime: SUMMARY_STALE_TIME_MS,
  });
}

export function reviewListOptions(api: ApiClient, productId: string, filters: ReviewFilters) {
  return infiniteListOptions({
    queryKey: reviewKeys.list(productId, filters),
    fetchPage: async (cursor, signal) => {
      const { data, meta } = await unwrap(
        api.GET('/api/v1/products/{productId}/reviews', {
          params: {
            path: { productId },
            query: {
              limit: cursor === undefined ? FIRST_PAGE_SIZE : NEXT_PAGE_SIZE,
              sort: REVIEW_SORTS[filters.sort],
              ...(cursor === undefined ? {} : { cursor }),
              ...(filters.ratings.length === 0
                ? {}
                : { 'rating[in]': inValues(filters.ratings.map(String)) }),
              ...(filters.withPhotos ? { 'hasImages[eq]': true } : {}),
            },
          },
          signal,
        }),
      );
      return { data, meta };
    },
    staleTime: LIST_STALE_TIME_MS,
  });
}
