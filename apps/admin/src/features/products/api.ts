import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// Admin product view (spec 03 AD-27; design 02 §5.2 `products.detail`) and the seller's store listing on AD-05
// (AD-Q-11: no admin product search exists; products are reached from orders, reviews and the seller's store).

export type AdminProduct = Schema<'AdminProductDetailDto'>;
export type AdminVariant = AdminProduct['variants'][number];
export type StoreProduct = Schema<'ProductListItemDto'>;

/** One page of the seller's store on AD-05; "Load more" for the rest. */
const STORE_PAGE_SIZE = 12;

export const productKeys = {
  detail: (productId: string) => queryKey('admin', 'products', 'detail', { productId }),
  store: (sellerId: string) => queryKey('admin', 'products', 'store', { sellerId }),
};

/** AD-27: stale 0 (design 02 §5.2): a block changes what the store shows at once. */
export function productQuery(productId: string) {
  return queryOptions({
    queryKey: productKeys.detail(productId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/products/{productId}', { params: { path: { productId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/** No such product, or not a product id at all (the backend checks the id format first, as R-36). */
export function isProductMissing(error: unknown): boolean {
  return isApiError(error, 'PRODUCT_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const productPath = (productId: string) => ({ params: { path: { productId } } });

/** `200` is the product after the change (spec 03 AD-27). */
export async function blockProduct(productId: string, reason: string): Promise<AdminProduct> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/products/{productId}/block', {
        ...productPath(productId),
        body: { reason },
      }),
    )
  ).data;
}

export async function unblockProduct(productId: string): Promise<AdminProduct> {
  return (await unwrap(browserApi.POST('/api/v1/admin/products/{productId}/unblock', productPath(productId))))
    .data;
}

/** AD-05 "Products in the store": the public listing, newest first; only what customers can see. */
export function storeProductsOptions(sellerId: string) {
  return infiniteListOptions({
    queryKey: productKeys.store(sellerId),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/products', {
          params: {
            query: {
              limit: STORE_PAGE_SIZE,
              sort: '-publishedAt',
              'sellerId[eq]': sellerId,
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}
