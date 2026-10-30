// Seller reviews copy (spec 02 §8.3 SE-20); the rest approved as TL4-COPY (CLAUDE.md §14.1bk).

const starsLabel = (stars: number) => `${String(stars)} ${stars === 1 ? 'star' : 'stars'}`;

export const REVIEWS_COPY = {
  title: 'Reviews',
  /** filters */
  product: 'Product',
  allProducts: 'All products',
  productsFailed: "Your products couldn't be loaded for the filter.",
  filterByRating: 'Filter by rating',
  stars: starsLabel,
  notReplied: 'Not replied',
  from: 'From',
  clearFilters: 'Clear filters',
  /** list */
  listLabel: 'Reviews of your products',
  empty: 'No reviews yet.',
  emptyFiltered: 'No reviews match these filters.',
  listFailed: "Reviews couldn't be loaded.",
  edited: 'Edited',
  reviewPhotos: (reviewer: string) => `Photos from ${reviewer}`,
  yourReply: 'Your reply',
  // Reply
  reply: 'Reply',
  /** the reply button's accessible name */
  replyTo: (reviewer: string) => `Reply to ${reviewer}`,
  replyNote: "You can reply once and can't edit it later.",
  sendReply: 'Send reply',
  cancel: 'Cancel',
  replied: 'Reply sent.',
  characters: (count: number, max: number) => `${String(count)} / ${String(max)}`,
  cantReply: "This review can't be replied to any more.",
} as const;
