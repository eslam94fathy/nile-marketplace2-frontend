// Review copy (spec 01 SF-05-R; entries marked TK2-COPY approved 2026-10-30, CLAUDE.md §14.1az).
export const REVIEWS_COPY = {
  /** TK2-COPY: section heading. */
  heading: 'Reviews',
  noReviews: 'No reviews yet.',
  /** TK2-COPY. */
  loadFailed: "Reviews couldn't be loaded.",
  /** TK2-COPY: a filter with no matching review. */
  noMatches: 'No reviews match these filters.',
  /** TK2-COPY. */
  clearFilters: 'Show all reviews',
  /** TK2-COPY: summary and filter labels. */
  summary: 'Rating summary',
  outOfFive: 'out of 5',
  distributionRow: (stars: number, count: number) =>
    `${starsLabel(stars)}: ${String(count)} ${count === 1 ? 'review' : 'reviews'}`,
  stars: (stars: number) => starsLabel(stars),
  filterByRating: 'Filter by rating',
  withPhotos: 'With photos',
  sortLabel: 'Sort by',
  sorts: {
    newest: 'Newest',
    'highest-rated': 'Highest rated',
    'lowest-rated': 'Lowest rated',
  },
  showMore: 'Show more reviews',
  edited: 'Edited',
  replyFrom: (businessName: string) => `Reply from ${businessName}`,
  /** TK2-COPY: review photos: the list's name and the lightbox title. */
  reviewPhotos: (reviewer: string) => `Photos from ${reviewer}`,
} as const;

function starsLabel(stars: number): string {
  return `${String(stars)} ${stars === 1 ? 'star' : 'stars'}`;
}

// SF-24 My reviews (spec 01 §10). Entries marked TK5-COPY approved 2026-10-30 (CLAUDE.md §14.1bc).
export const MY_REVIEWS_COPY = {
  /** TK5-COPY (the page's placeholder title since T-J6). */
  title: 'Your reviews',
  /** TK5-COPY */
  tabsLabel: 'Reviews',
  tabs: { 'to-review': 'To review', written: 'Written' },
  toReviewEmpty: 'Nothing to review right now. Products you receive can be reviewed for 60 days.',
  /** TK5-COPY */
  writtenEmpty: "You haven't written any reviews yet.",
  /** TK5-COPY */
  order: (orderNumber: string) => `Order ${orderNumber}`,
  delivered: (date: string) => `Delivered ${date}`,
  reviewBy: (date: string) => `Review by ${date}`,
  writeReview: 'Write a review',
  /** TK5-COPY: the SF-18 button's accessible name. */
  writeReviewFor: (product: string) => `Write a review of ${product}`,
  hidden: 'Hidden by Nile',
  hiddenNote: "This review isn't shown on the product page.",
  /** TK5-COPY: `MyReviewDto` doesn't name the seller. */
  sellerReply: "Seller's reply",
  edit: 'Edit',
  delete: 'Delete',
  /** TK5-COPY: the action buttons' accessible names. */
  editNamed: (product: string) => `Edit your review of ${product}`,
  deleteNamed: (product: string) => `Delete your review of ${product}`,
  /** TK5-COPY */
  deleteTitle: 'Delete review',
  deleteConfirm: (product: string) =>
    `Delete your review of ${product}? You can write a new one while the review period is open.`,
  /** TK5-COPY */
  deleted: 'Review deleted.',
  /** Spec 01 §10.6 for REVIEW_NOT_FOUND. */
  gone: 'This item no longer exists.',
  /** TK5-COPY */
  loadFailed: "Your reviews couldn't be loaded.",
} as const;

// SF-25 Write / edit a review (spec 01 §10). Entries marked TK5-COPY approved 2026-10-30 (CLAUDE.md §14.1bc).
export const REVIEW_FORM_COPY = {
  /** TK5-COPY */
  writeTitle: 'Write a review',
  /** TK5-COPY */
  editTitle: 'Edit your review',
  rating: 'Rating',
  /** TK5-COPY */
  ratingRequired: 'Choose a rating.',
  title: 'Title',
  body: 'Review',
  photos: 'Photos',
  /** TK5-COPY: the review text counter. */
  counter: (used: number, max: number) => `${String(used)} / ${String(max)}`,
  /** TK5-COPY */
  publish: 'Publish review',
  /** TK5-COPY */
  save: 'Save changes',
  published: 'Thanks, your review is published.',
  cannotReview: "This item can't be reviewed.",
  editClosed: 'Reviews can be edited for 30 days after posting.',
  /** TK5-COPY: the link back to SF-24. */
  backToReviews: 'Your reviews',
  /** TK5-COPY: the link from REVIEW_ALREADY_EXISTS. */
  seeWritten: 'See your reviews',
  errors: {
    REVIEW_ALREADY_EXISTS: "You've already reviewed this product.",
    REVIEW_NOT_ALLOWED: "This item can't be reviewed.",
    REVIEW_WINDOW_CLOSED: 'The review period for this item has ended.',
    REVIEW_EDIT_WINDOW_CLOSED: 'This review can no longer be edited.',
  },
  /** TK5-COPY */
  loadFailed: "This review couldn't be loaded.",
} as const;
