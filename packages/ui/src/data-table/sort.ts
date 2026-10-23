// The API's sort parameter (api-inventory §3): `field` ascending, `-field` descending, one field at a time.

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  readonly field: string;
  readonly direction: SortDirection;
}

const DESCENDING_PREFIX = '-';

export function parseSort(sort: string | undefined): SortState | undefined {
  if (sort === undefined || sort === '' || sort === DESCENDING_PREFIX) return undefined;
  return sort.startsWith(DESCENDING_PREFIX)
    ? { field: sort.slice(DESCENDING_PREFIX.length), direction: 'desc' }
    : { field: sort, direction: 'asc' };
}

export function formatSort({ field, direction }: SortState): string {
  return direction === 'desc' ? `${DESCENDING_PREFIX}${field}` : field;
}

/**
 * Next sort after a click on a column: the same column flips direction; another column starts with its
 * first direction (dates usually newest first).
 */
export function nextSort(
  current: string | undefined,
  field: string,
  firstDirection: SortDirection = 'asc',
): string {
  const state = parseSort(current);
  if (state?.field !== field) return formatSort({ field, direction: firstDirection });
  return formatSort({ field, direction: state.direction === 'asc' ? 'desc' : 'asc' });
}
