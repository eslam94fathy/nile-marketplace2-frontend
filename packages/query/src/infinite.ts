import type { components } from '@nile/api';
import { infiniteQueryOptions, type QueryKey } from '@tanstack/react-query';

export type PageMeta = components['schemas']['PageMeta'];

/** One page of a cursor-paginated list as `unwrap()` returns it. */
export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

/** Next cursor while the backend says there is more; `undefined` ends the list (CLAUDE.md §3). */
export function getNextPageParam(lastPage: Page<unknown>): string | undefined {
  return lastPage.meta.hasMore && lastPage.meta.nextCursor !== null ? lastPage.meta.nextCursor : undefined;
}

export interface InfiniteListConfig<T, K extends QueryKey> {
  queryKey: K;
  /** Fetches one page; `cursor` is undefined for the first page. Pass `signal` on to the call. */
  fetchPage: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>;
  staleTime?: number;
}

/** `infiniteQueryOptions` for a cursor list: first page without a cursor, then `meta.nextCursor`. */
export function infiniteListOptions<T, const K extends QueryKey>(config: InfiniteListConfig<T, K>) {
  return infiniteQueryOptions({
    queryKey: config.queryKey,
    queryFn: ({ pageParam, signal }) => config.fetchPage(pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam,
    ...(config.staleTime === undefined ? {} : { staleTime: config.staleTime }),
  });
}
