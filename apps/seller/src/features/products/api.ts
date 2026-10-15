import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import type { ProductFilters } from './lib/list-params';

// The seller's products and variants (design 02 §2.3 `products.*`, §3.3 mutations).

export type SellerProductListItem = Schema<'SellerProductDto'>;
export type SellerProduct = Schema<'SellerProductDetailDto'>;
export type SellerVariant = Schema<'SellerVariantDto'>;
export type CategoryNode = Schema<'CategoryNodeDto'>;
export type EffectiveAttribute = Schema<'EffectiveAttributeDto'>;

const PRODUCTS_PAGE_SIZE = 20;

export const productKeys = {
  lists: () => queryKey('seller', 'products', 'list'),
  list: (filters: ProductFilters) => queryKey('seller', 'products', 'list', filters),
  detail: (productId: string) => queryKey('seller', 'products', 'detail', { productId }),
};

/** SE-08: newest first, 20 per page, filters as literal API keys. */
export function productsListOptions(filters: ProductFilters) {
  return infiniteListOptions({
    queryKey: productKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/seller/products', {
          params: {
            query: {
              limit: PRODUCTS_PAGE_SIZE,
              sort: '-createdAt',
              ...(filters.status === null ? {} : { 'status[eq]': filters.status }),
              ...(filters.categoryId === null ? {} : { 'categoryId[eq]': filters.categoryId }),
              ...(filters.name === null ? {} : { 'name[like]': filters.name }),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

/** SE-10: stale 0, the page always shows the last answer (design 02 §2.3). */
export function productQuery(productId: string) {
  return queryOptions({
    queryKey: productKeys.detail(productId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/seller/products/{productId}', { params: { path: { productId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/**
 * No such product for this seller: `PRODUCT_NOT_FOUND` (also another seller's), or `VALIDATION_FAILED` because
 * the id in the URL isn't a product id at all (the backend checks the format first, as for orders, R-36).
 */
export function isProductMissing(error: unknown): boolean {
  return isApiError(error, 'PRODUCT_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const path = (productId: string) => ({ params: { path: { productId } } });
const variantPath = (productId: string, variantId: string) => ({
  params: { path: { productId, variantId } },
});

export async function createProduct(body: Schema<'CreateProductDto'>): Promise<SellerProduct> {
  return (await unwrap(browserApi.POST('/api/v1/seller/products', { body }))).data;
}

export async function updateProduct(
  productId: string,
  body: Schema<'UpdateProductDto'>,
): Promise<SellerProduct> {
  return (await unwrap(browserApi.PATCH('/api/v1/seller/products/{productId}', { ...path(productId), body })))
    .data;
}

export async function activateProduct(productId: string): Promise<SellerProduct> {
  return (await unwrap(browserApi.POST('/api/v1/seller/products/{productId}/activate', path(productId))))
    .data;
}

export async function deactivateProduct(productId: string): Promise<SellerProduct> {
  return (await unwrap(browserApi.POST('/api/v1/seller/products/{productId}/deactivate', path(productId))))
    .data;
}

export async function deleteProduct(productId: string): Promise<void> {
  await unwrap(browserApi.DELETE('/api/v1/seller/products/{productId}', path(productId)));
}

export async function createVariant(
  productId: string,
  body: Schema<'CreateVariantDto'>,
): Promise<SellerVariant> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/products/{productId}/variants', { ...path(productId), body }),
    )
  ).data;
}

export async function updateVariant(
  productId: string,
  variantId: string,
  body: Schema<'UpdateVariantDto'>,
): Promise<SellerVariant> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/seller/products/{productId}/variants/{variantId}', {
        ...variantPath(productId, variantId),
        body,
      }),
    )
  ).data;
}

export async function deleteVariant(productId: string, variantId: string): Promise<void> {
  await unwrap(
    browserApi.DELETE(
      '/api/v1/seller/products/{productId}/variants/{variantId}',
      variantPath(productId, variantId),
    ),
  );
}
