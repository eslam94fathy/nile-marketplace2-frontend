// Copy owned by the shared components (CLAUDE.md §7: no inline literals). Screen copy lives with the screens.
export const UI_COPY = {
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
} as const;
