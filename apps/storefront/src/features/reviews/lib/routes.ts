import { ROUTES } from '@/lib/routes';

// SF-24 / SF-25 URLs (spec 01 §10.2). Tabs live in the URL as `?tab=`, like the order tabs (R-36).

export const REVIEW_TABS = ['to-review', 'written'] as const;
export type ReviewsTab = (typeof REVIEW_TABS)[number];

export const REVIEWS_PARAMS = { tab: 'tab', review: 'review', item: 'item' } as const;

export function parseReviewsTab(value: string | null): ReviewsTab | null {
  return REVIEW_TABS.find((tab) => tab === value) ?? null;
}

export function reviewsTabHref(tab: ReviewsTab): `/account/reviews?${string}` {
  return `${ROUTES.reviews}?${REVIEWS_PARAMS.tab}=${tab}`;
}

/** SF-25 write, from SF-24 "To review" or an SF-18 item. */
export function writeReviewPath(orderItemId: string): `/account/reviews/write?${string}` {
  return `${ROUTES.reviews}/write?${new URLSearchParams({ [REVIEWS_PARAMS.item]: orderItemId }).toString()}`;
}

export function editReviewPath(reviewId: string): `/account/reviews/${string}/edit` {
  return `${ROUTES.reviews}/${reviewId}/edit`;
}
