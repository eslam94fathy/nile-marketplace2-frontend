import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { reviewApiQuery, type ReviewFilters } from './lib/list-params';

// Review moderation (spec 03 AD-30, AD-31; design 02 §5.2 `reviews.list` / `.detail`, §5.4 hide / show).

export type AdminReview = Schema<'AdminReviewDto'>;

const REVIEWS_PAGE_SIZE = 20;

export const reviewKeys = {
  lists: () => queryKey('admin', 'reviews', 'list'),
  list: (filters: ReviewFilters) => queryKey('admin', 'reviews', 'list', filters),
  detail: (reviewId: string) => queryKey('admin', 'reviews', 'detail', { reviewId }),
};

export function reviewsListOptions(filters: ReviewFilters) {
  return infiniteListOptions({
    queryKey: reviewKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/reviews', {
          params: {
            query: {
              limit: REVIEWS_PAGE_SIZE,
              ...reviewApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

export function reviewQuery(reviewId: string) {
  return queryOptions({
    queryKey: reviewKeys.detail(reviewId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/reviews/{reviewId}', { params: { path: { reviewId } }, signal }),
        )
      ).data,
  });
}

/** No such review, or not a review id at all (the backend checks the id format first, as R-36). */
export function isReviewMissing(error: unknown): boolean {
  return isApiError(error, 'REVIEW_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const reviewPath = (reviewId: string) => ({ params: { path: { reviewId } } });

/** Every action answers with the review after the change. */
export async function hideReview(reviewId: string, reason: string): Promise<AdminReview> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/reviews/{reviewId}/hide', { ...reviewPath(reviewId), body: { reason } }),
    )
  ).data;
}

export async function unhideReview(reviewId: string): Promise<AdminReview> {
  return (await unwrap(browserApi.POST('/api/v1/admin/reviews/{reviewId}/unhide', reviewPath(reviewId))))
    .data;
}

export async function hideReply(reviewId: string, reason: string): Promise<AdminReview> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/reviews/{reviewId}/reply/hide', {
        ...reviewPath(reviewId),
        body: { reason },
      }),
    )
  ).data;
}

export async function unhideReply(reviewId: string): Promise<AdminReview> {
  return (
    await unwrap(browserApi.POST('/api/v1/admin/reviews/{reviewId}/reply/unhide', reviewPath(reviewId)))
  ).data;
}
