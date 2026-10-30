// Copy owned by the shared components (CLAUDE.md §7: no inline literals). Screen copy lives with the screens.

function reviewCount(count: number): string {
  return count === 1 ? '1 review' : `${String(count)} reviews`;
}

export const UI_COPY = {
  /** The product name in UI copy (conventions §11); the logo's accessible name. */
  brandName: 'Nile',
  close: 'Close',
  cancel: 'Cancel',
  confirm: 'Confirm',
  tryAgain: 'Try again',
  loadMore: 'Load more',
  loading: 'Loading…',
  moreLoaded: 'More items loaded.',
  sortAscending: 'sorted ascending',
  sortDescending: 'sorted descending',
  sortBy: (column: string) => `Sort by ${column}`,
  /** conventions §3: the correlation id, in small text, so support can find the request. */
  reference: (correlationId: string) => `Reference: ${correlationId}`,
  /** conventions §3/§4: default error message. */
  genericError: 'Something went wrong. Please try again.',
  required: '(required)',
  showPassword: 'Show password',
  quantity: 'Quantity',
  decreaseQuantity: 'Decrease quantity',
  increaseQuantity: 'Increase quantity',
  /** Read before the 10 digits of an Egyptian mobile number (conventions §5). */
  phonePrefix: (prefix: string) => `Country code ${prefix}`,
  skipToContent: 'Skip to main content',
  menu: 'Menu',
  signOut: 'Sign out',
  notFoundTitle: 'Page not found',
  notFoundMessage: "The page you're looking for doesn't exist or has moved.",
  errorTitle: 'Something went wrong',
  /** Stand-in screens (T-C3) until their task builds them. */
  placeholder: (task: string) => `This screen arrives with ${task}.`,
  /** A private image that failed again after its resource was read again (conventions §12.1). */
  imageUnavailable: "This image can't be shown.",
  /** Photo uploads (conventions §12.2). */
  addPhotos: 'Add photos',
  photoLimits: 'JPEG, PNG or WebP, up to 5 MB each, at least 200 × 200 px.',
  // Not in conventions §12.2; approved 2026-10-28 (CLAUDE.md §14.1at).
  uploadChecking: 'Checking…',
  uploadProgress: (percent: number) => `Uploading ${String(percent)} %`,
  uploadProgressOf: (fileName: string) => `Upload of ${fileName}`,
  uploadProcessing: 'Processing…',
  uploadReady: 'Ready',
  remove: 'Remove',
  removeUpload: (fileName: string) => `Remove ${fileName}`,
  retryUpload: (fileName: string) => `Try again: ${fileName}`,
  /** Under a form's submit button while photos are still uploading. */
  waitForUploads: 'Wait for the photos to finish uploading.',
  /** Ratings (conventions §12.8). */
  noReviewsYet: 'No reviews yet',
  ratingShort: (avg: string, count: number) => `${avg} (${reviewCount(count)})`,
  ratedOutOf: (avg: string, count: number) => `Rated ${avg} out of 5 from ${reviewCount(count)}`,
  /** One review's rating (approved 2026-10-30, TK2-COPY). */
  ratedValue: (rating: number) => `Rated ${String(rating)} out of 5`,
  /** Product photos and their lightbox (conventions §12.1; approved 2026-10-30, TK1-COPY). */
  photos: 'Photos',
  showPhoto: (index: number, total: number) => `Show photo ${String(index)} of ${String(total)}`,
  enlargePhoto: 'View larger',
  photoOf: (index: number, total: number) => `Photo ${String(index)} of ${String(total)}`,
  previousPhoto: 'Previous photo',
  nextPhoto: 'Next photo',
} as const;
