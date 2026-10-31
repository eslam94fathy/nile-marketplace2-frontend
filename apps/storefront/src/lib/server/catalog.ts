import 'server-only';
import { isApiError, productQuery, unwrap, type ProductQueryInput } from '@nile/api';
import { categoryAttributesQuery, getQueryClient } from '@nile/query';
import { connection } from 'next/server';
import { cache } from 'react';
import {
  parseListingParams,
  productListOptions,
  resolveListing,
  toProductQuery,
  type CategoryNode,
  type EffectiveAttribute,
  type ResolvedListing,
  type SearchParams,
} from '@/features/catalog';
import { CATEGORY_TREE_REVALIDATE_SECONDS } from './categories';
import { publicServerApi } from './public-api';

/**
 * A category's effective attributes (own + inherited, for the filter facets), cached like the tree (5 min).
 * Null when the category no longer exists (`CATEGORY_NOT_FOUND`): the listing then has no facets.
 */
export const getCategoryAttributes = cache(async (categoryId: string) => {
  await connection();
  try {
    return await getQueryClient().query(
      categoryAttributesQuery(
        publicServerApi({ revalidateSeconds: CATEGORY_TREE_REVALIDATE_SECONDS }),
        categoryId,
      ),
    );
  } catch (error) {
    if (isApiError(error, 'CATEGORY_NOT_FOUND')) return null;
    throw error;
  }
});

/**
 * Puts the first page of a listing into the request's query client for hydration (spec 01 SF-04: first page
 * server-rendered). Never cached (stock and visibility are live). A failure is left to the client, which
 * fetches again and shows the error state or resets an INVALID_QUERY.
 */
export async function prefetchProducts(query: ProductQueryInput): Promise<void> {
  await connection();
  await getQueryClient()
    .infiniteQuery(productListOptions(publicServerApi(), query))
    .catch(() => undefined);
}

export interface LoadedListing {
  readonly listing: ResolvedListing;
  readonly query: ProductQueryInput;
  readonly attributes: readonly EffectiveAttribute[] | null;
}

/**
 * A listing page's data from its URL (spec 01 SF-02…SF-04): the category in effect (the route's, or the
 * search page's `category=` slug when it exists in the tree), its attributes for the facets, the validated
 * listing and its API query, with the first page prefetched for hydration.
 */
export async function loadListing(
  params: SearchParams,
  category: CategoryNode | null,
): Promise<LoadedListing> {
  const state = parseListingParams(params);
  const attributes = category === null ? null : await getCategoryAttributes(category.id).catch(() => null);
  const listing = resolveListing(
    { ...state, categorySlug: category === null ? null : state.categorySlug },
    { categoryId: category?.id ?? null, categoryAttributes: attributes },
  );
  const query = toProductQuery(listing);
  await prefetchProducts(query);
  return { listing, query, attributes };
}

/** Home "New arrivals" (spec 01 SF-01): the 12 newest products, never cached. */
export const NEW_ARRIVALS_COUNT = 12;

export async function getNewArrivals() {
  await connection();
  const query = productQuery({ limit: NEW_ARRIVALS_COUNT, sort: '-publishedAt' });
  return (await unwrap(publicServerApi().GET('/api/v1/products', { params: { query } }))).data;
}

/**
 * One product by id or slug (spec 01 SF-05), never cached (stock and visibility are live); once per request
 * for the page and its metadata. Null for `PRODUCT_NOT_FOUND` (hidden, deleted, suspended seller).
 */
export const getProduct = cache(async (idOrSlug: string) => {
  await connection();
  try {
    return (
      await unwrap(publicServerApi().GET('/api/v1/products/{idOrSlug}', { params: { path: { idOrSlug } } }))
    ).data;
  } catch (error) {
    if (isApiError(error, 'PRODUCT_NOT_FOUND')) return null;
    throw error;
  }
});

/** SF-22: a seller's public profile is cached for 5 minutes (spec 01). */
export const SELLER_REVALIDATE_SECONDS = 300;

/**
 * A public seller page's seller (spec 01 SF-22), cached 5 min and once per request for the page and its
 * metadata. Null when the seller isn't approved or doesn't exist (`SELLER_NOT_FOUND`; a malformed id is the
 * same to a visitor).
 */
export const getSeller = cache(async (sellerId: string) => {
  try {
    return (
      await unwrap(
        publicServerApi({ revalidateSeconds: SELLER_REVALIDATE_SECONDS }).GET('/api/v1/sellers/{sellerId}', {
          params: { path: { sellerId } },
        }),
      )
    ).data;
  } catch (error) {
    if (isApiError(error, 'SELLER_NOT_FOUND', 'VALIDATION_FAILED')) return null;
    throw error;
  }
});
