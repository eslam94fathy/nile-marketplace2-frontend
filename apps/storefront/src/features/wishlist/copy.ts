// Wishlist copy (spec 01 SF-23, SF-23-A1). Entries marked TK3-COPY approved 2026-10-30 (CLAUDE.md §14.1ba).
export const WISHLIST_COPY = {
  /** TK3-COPY: page title, header link and account menu entry. */
  title: 'Wishlist',
  save: 'Save to wishlist',
  remove: 'Remove from wishlist',
  saved: 'Saved to your wishlist.',
  full: 'Your wishlist is full (200 items). Remove something to save this.',
  productGone: "This product isn't available any more.",
  empty: 'Your wishlist is empty. Tap the heart on a product to save it here.',
  noLongerAvailable: 'No longer available',
  outOfStock: 'Out of stock',
  removeItem: 'Remove',
  /** TK3-COPY: the Remove button's accessible name. */
  removeNamed: (name: string) => `Remove ${name} from your wishlist`,
  /** TK3-COPY */
  loadFailed: "Your wishlist couldn't be loaded.",
} as const;
