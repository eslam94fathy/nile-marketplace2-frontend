import { unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The customer's own reviews (spec 01 SF-24, SF-25; design 02 §2.2 `myReviews.*`). Every key starts with
// `['storefront', 'my-reviews']`, so a write refreshes both tabs, the SF-18 buttons and the edit screen at once.

export type ReviewableItem = Schema<'ReviewableItemDto'>;
export type MyReview = Schema<'MyReviewDto'>;
export type CreateReviewBody = Schema<'CreateReviewDto'>;
export type EditReviewBody = Schema<'EditReviewDto'>;

export const MY_REVIEWS_PAGE_SIZE = 20;
/** The largest page the API serves (api-inventory §2): SF-18 and SF-25 read every reviewable item. */
const ALL_ITEMS_PAGE_SIZE = 100;
/** 10 × 100 items delivered in the last 60 days is far beyond any real customer; a bound, not a limit. */
const ALL_ITEMS_MAX_PAGES = 10;
const REVIEWABLE_STALE_TIME_MS = 60_000;
/** Backend `REVIEW_MAX_IMAGES` (RV-3). */
export const REVIEW_MAX_PHOTOS = 4;
export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MAX = 2000;

export const myReviewKeys = {
  all: () => ['storefront', 'my-reviews'] as const,
  reviewable: () => queryKey('storefront', 'my-reviews', 'reviewable'),
  reviewableAll: () => queryKey('storefront', 'my-reviews', 'reviewable-all'),
  list: () => queryKey('storefront', 'my-reviews', 'list'),
  detail: (reviewId: string) => queryKey('storefront', 'my-reviews', 'detail', { reviewId }),
};

/** SF-24 "To review": newest delivery first, 20 per page. */
export function reviewableListOptions() {
  return infiniteListOptions({
    queryKey: myReviewKeys.reviewable(),
    fetchPage: async (cursor, signal) => {
      const { data, meta } = await unwrap(
        browserApi.GET('/api/v1/me/reviewable-items', {
          params: { query: { limit: MY_REVIEWS_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) } },
          signal,
        }),
      );
      return { data, meta };
    },
    staleTime: REVIEWABLE_STALE_TIME_MS,
  });
}

/**
 * Every reviewable item (SF-18 buttons, SF-25 write): the API has no filter by order or item, so the list is
 * read whole, 100 per page.
 */
export function allReviewableQuery() {
  return queryOptions({
    queryKey: myReviewKeys.reviewableAll(),
    queryFn: async ({ signal }) => {
      const items: ReviewableItem[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < ALL_ITEMS_MAX_PAGES; page += 1) {
        const { data, meta } = await unwrap(
          browserApi.GET('/api/v1/me/reviewable-items', {
            params: { query: { limit: ALL_ITEMS_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) } },
            signal,
          }),
        );
        items.push(...data);
        if (!meta.hasMore || meta.nextCursor === null) break;
        cursor = meta.nextCursor;
      }
      return items;
    },
    staleTime: REVIEWABLE_STALE_TIME_MS,
  });
}

/** SF-24 "Written": newest first, hidden ones included. */
export function myReviewsListOptions() {
  return infiniteListOptions({
    queryKey: myReviewKeys.list(),
    fetchPage: async (cursor, signal) => {
      const { data, meta } = await unwrap(
        browserApi.GET('/api/v1/me/reviews', {
          params: {
            query: {
              limit: MY_REVIEWS_PAGE_SIZE,
              sort: '-createdAt',
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      );
      return { data, meta };
    },
  });
}

export function myReviewQuery(reviewId: string) {
  return queryOptions({
    queryKey: myReviewKeys.detail(reviewId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/me/reviews/{reviewId}', { params: { path: { reviewId } }, signal }),
        )
      ).data,
  });
}

/** No idempotency key: one live review per product makes a repeat harmless [SPEC 17 §4.2]. */
export async function createReview(body: CreateReviewBody): Promise<MyReview> {
  return (await unwrap(browserApi.POST('/api/v1/reviews', { body }))).data;
}

export async function editReview(reviewId: string, body: EditReviewBody): Promise<MyReview> {
  return (
    await unwrap(browserApi.PATCH('/api/v1/me/reviews/{reviewId}', { params: { path: { reviewId } }, body }))
  ).data;
}

export async function deleteReview(reviewId: string): Promise<void> {
  await unwrap(browserApi.DELETE('/api/v1/me/reviews/{reviewId}', { params: { path: { reviewId } } }));
}
