// Public interface of @nile/query (design 01 §2, R-1). React-only helpers live here, not in @nile/api.
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
export {
  IN_PROGRESS_MAX_RETRIES,
  IN_PROGRESS_RETRY_DELAY_MS,
  stableJson,
  useIdempotentMutation,
  type IdempotentMutationOptions,
  type IdempotentMutationResult,
} from './idempotent-mutation';
export { QueryProvider } from './provider';
export { applyServerErrors, errorMessage, type ServerFieldMap, type SetFieldError } from './server-errors';
export { dehydrate, HydrationBoundary } from '@tanstack/react-query';
