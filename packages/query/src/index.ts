// Public interface of @nile/query (design 01 §2, R-1). React-only helpers live here, not in @nile/api.
// Later tasks add useIdempotentMutation (first idempotent screen), useApiErrorHandler and applyServerErrors
// (first forms, phase d).
export {
  DEFAULT_GC_TIME_MS,
  DEFAULT_STALE_TIME_MS,
  getQueryClient,
  makeQueryClient,
  MAX_QUERY_RETRIES,
  shouldRetryQuery,
} from './query-client';
export {
  clearPrivateQueries,
  publicKeys,
  queryKey,
  QUERY_SCOPES,
  type QueryKeyOf,
  type QueryScope,
} from './keys';
export {
  getNextPageParam,
  infiniteListOptions,
  type InfiniteListConfig,
  type Page,
  type PageMeta,
} from './infinite';
export {
  categoriesTreeQuery,
  categoryAttributesQuery,
  governoratesQuery,
  PUBLIC_REFERENCE_STALE_TIME_MS,
} from './public-queries';
export { QueryProvider } from './provider';
export { dehydrate, HydrationBoundary } from '@tanstack/react-query';
