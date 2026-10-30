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
