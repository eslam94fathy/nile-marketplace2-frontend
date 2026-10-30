import { isApiError, unwrap, type ApiClient, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';

// Wishlist (spec 01 SF-23, design 02 §2.2 `wishlist.ids`, `wishlist.list`). The ids are read once per session
// (stale 5 min) and drive every heart; the page reads the list fresh on every visit.

export type WishlistItem = Schema<'WishlistItemDto'>;

const IDS_STALE_TIME_MS = 5 * 60_000;
export const WISHLIST_PAGE_SIZE = 20;
/** Backend `WISHLIST_MAX_ITEMS` [SPEC 04 WL-1], named in the "full" message. */
export const WISHLIST_LIMIT = 200;
/**
 * Set on the page a signed-out shopper came from (inside `returnTo`), so the product is saved once after
 * sign-in, whatever route the sign-in took (register, verify email) (SF-Q-17).
 */
export const WISHLIST_PARAM = 'wishlist';

export const wishlistKeys = {
  all: () => ['storefront', 'wishlist'] as const,
  ids: () => queryKey('storefront', 'wishlist', 'ids'),
  list: () => queryKey('storefront', 'wishlist', 'list'),
};

export function wishlistIdsQuery(api: ApiClient) {
  return queryOptions({
    queryKey: wishlistKeys.ids(),
    queryFn: async ({ signal }) =>
      (await unwrap(api.GET('/api/v1/me/wishlist/product-ids', { signal }))).data.productIds,
    staleTime: IDS_STALE_TIME_MS,
  });
}

export function wishlistListOptions(api: ApiClient) {
  return infiniteListOptions({
    queryKey: wishlistKeys.list(),
    fetchPage: async (cursor, signal) => {
      const { data, meta } = await unwrap(
        api.GET('/api/v1/me/wishlist', {
          params: { query: { limit: WISHLIST_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) } },
          signal,
        }),
      );
      return { data, meta };
    },
    staleTime: 0,
  });
}

/** `PUT` (save) or `DELETE` (remove); both idempotent and answer `204`. */
export async function setWishlisted(api: ApiClient, productId: string, saved: boolean): Promise<void> {
  const params = { params: { path: { productId } } };
  await unwrap(
    saved
      ? api.PUT('/api/v1/me/wishlist/{productId}', params)
      : api.DELETE('/api/v1/me/wishlist/{productId}', params),
  );
}

/** Idempotent calls are sent again once when no answer arrived (design 02 §4, SF-23-A1). */
export function retryOnceOnNetworkError(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isApiError(error, 'NETWORK_ERROR');
}
