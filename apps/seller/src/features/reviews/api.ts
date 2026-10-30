import { unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { reviewApiQuery, type ReviewFilters } from './lib/params';

// Reviews of the seller's products (design 02 §5.2 `reviews.list(params)`, §5.4 reply).

export type SellerReview = Schema<'SellerReviewDto'>;

const REVIEWS_PAGE_SIZE = 20;
/** The largest page the API serves (api-inventory §2): the product filter lists every product. */
const PRODUCT_CHOICES_PAGE_SIZE = 100;
/** 10 × 100 products: a bound, not a limit. */
const PRODUCT_CHOICES_MAX_PAGES = 10;
const PRODUCT_CHOICES_STALE_MS = 5 * 60_000;
/** Reply 1..1000 characters, trimmed (`ReplyDto`, backend RV-5). */
export const REPLY_MAX = 1000;

export const reviewKeys = {
  /** Prefix of every review key. */
  all: () => ['seller', 'reviews'] as const,
  lists: () => queryKey('seller', 'reviews', 'list'),
  list: (filters: ReviewFilters) => queryKey('seller', 'reviews', 'list', filters),
  productChoices: () => queryKey('seller', 'reviews', 'product-choices'),
};

/** SE-20: newest first, 20 per page, the URL's filters as literal API keys. */
export function reviewsListOptions(filters: ReviewFilters) {
  return infiniteListOptions({
    queryKey: reviewKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/seller/reviews', {
          params: {
            query: {
              limit: REVIEWS_PAGE_SIZE,
              sort: '-createdAt',
              ...reviewApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

export interface ProductChoice {
  readonly id: string;
  readonly name: string;
}

/** The product filter's choices: every product, by name (the API sorts by date only). */
export function productChoicesQuery() {
  return queryOptions({
    queryKey: reviewKeys.productChoices(),
    queryFn: async ({ signal }) => {
      const products: ProductChoice[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < PRODUCT_CHOICES_MAX_PAGES; page += 1) {
        const { data, meta } = await unwrap(
          browserApi.GET('/api/v1/seller/products', {
            params: {
              query: { limit: PRODUCT_CHOICES_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
            },
            signal,
          }),
        );
        products.push(...data.map(({ id, name }) => ({ id, name })));
        if (!meta.hasMore || meta.nextCursor === null) break;
        cursor = meta.nextCursor;
      }
      return products.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    },
    staleTime: PRODUCT_CHOICES_STALE_MS,
  });
}

export async function replyToReview(reviewId: string, body: string): Promise<SellerReview> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/reviews/{reviewId}/reply', {
        params: { path: { reviewId } },
        body: { body },
      }),
    )
  ).data;
}
