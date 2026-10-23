import { productQuery, unwrap, type ApiClient, type ProductQueryInput } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';

// Product listing query (design 02 §2.2 `products.list(params)`): one key per API query, so server prefetch,
// hydration and the client's "Load more" share it. The cursor is per page and never part of the key or URL.

const LISTING_STALE_TIME_MS = 30_000;

export const catalogKeys = {
  products: (query: ProductQueryInput) => queryKey('storefront', 'products', 'list', query),
};

/** `GET /products` as a cursor list; `api` is the server's public client or the browser's BFF client. */
export function productListOptions(api: ApiClient, query: ProductQueryInput) {
  return infiniteListOptions({
    queryKey: catalogKeys.products(query),
    fetchPage: async (cursor, signal) => {
      const { data, meta } = await unwrap(
        api.GET('/api/v1/products', {
          params: { query: productQuery({ ...query, ...(cursor === undefined ? {} : { cursor }) }) },
          signal,
        }),
      );
      return { data, meta };
    },
    staleTime: LISTING_STALE_TIME_MS,
  });
}
