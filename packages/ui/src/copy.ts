// Copy owned by the shared components (CLAUDE.md §7: no inline literals). Screen copy lives with the screens.
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
} as const;
