import { unwrap, type ApiClient } from '@nile/api';
import { queryOptions } from '@tanstack/react-query';
import { publicKeys } from './keys';

/** Public reference data changes rarely (backend caches it for an hour); design 02 §2.1. */
export const PUBLIC_REFERENCE_STALE_TIME_MS = 5 * 60_000;

/** `GET /categories`: active category tree. */
export function categoriesTreeQuery(api: ApiClient) {
  return queryOptions({
    queryKey: publicKeys.categoriesTree(),
    queryFn: async ({ signal }) => (await unwrap(api.GET('/api/v1/categories', { signal }))).data,
    staleTime: PUBLIC_REFERENCE_STALE_TIME_MS,
  });
}

/** `GET /categories/{categoryId}/attributes`: own and inherited attributes with options. */
export function categoryAttributesQuery(api: ApiClient, categoryId: string) {
  return queryOptions({
    queryKey: publicKeys.categoryAttributes(categoryId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          api.GET('/api/v1/categories/{categoryId}/attributes', { params: { path: { categoryId } }, signal }),
        )
      ).data,
    staleTime: PUBLIC_REFERENCE_STALE_TIME_MS,
  });
}

/**
 * `GET /governorates`: all 27 with their delivery fee (`null` = not deliverable). Checkout overrides the stale
 * time to 0 because fees feed the order total (design 02 §2.1).
 */
export function governoratesQuery(api: ApiClient) {
  return queryOptions({
    queryKey: publicKeys.governorates(),
    queryFn: async ({ signal }) => (await unwrap(api.GET('/api/v1/governorates', { signal }))).data,
    staleTime: PUBLIC_REFERENCE_STALE_TIME_MS,
  });
}
