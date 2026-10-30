import { productQuery, type ProductQueryInput, type Schema } from '@nile/api';
import { fields, parseMoney } from '@nile/domain';

// URL parameters ⇄ `GET /products` parameters (spec 01 SF-04). Every URL state maps to exactly one API
// request; invalid URL values are dropped, never sent. Pure functions: used by the server pages (first page)
// and the client listing (filter changes, "Load more").

export type EffectiveAttribute = Schema<'EffectiveAttributeDto'>;

export const LISTING_PARAMS = {
  q: 'q',
  category: 'category',
  minPrice: 'minPrice',
  maxPrice: 'maxPrice',
  inStock: 'inStock',
  seller: 'seller',
  rating: 'rating',
  sort: 'sort',
} as const;
/** `attr.<code>=opt1,opt2` (spec 01 SF-04). */
export const ATTRIBUTE_PARAM_PREFIX = 'attr.';
const IN_STOCK_VALUE = '1';

/** URL sort names → API sort values. `best-match` only with `q` (relevance without `q` is INVALID_QUERY). */
export const SORTS = {
  newest: '-publishedAt',
  'price-asc': 'minPrice',
  'price-desc': '-minPrice',
  'best-match': '-relevance',
  rating: '-rating',
} as const;
export type SortKey = keyof typeof SORTS;

export const PAGE_SIZE = 20;
export const Q_MIN_LENGTH = 2;
export const Q_MAX_LENGTH = 100;
export const MAX_ATTRIBUTE_FILTERS = 5;
export const MAX_ATTRIBUTE_VALUES = 20;

/** `rating=<n>` ↔ `rating[gte]=<n>`: whole stars 1..5 (spec 01 §10.3; the UI offers 4 and 3). */
const RATING_PARAM = /^[1-5]$/;
export const RATING_FILTERS = [4, 3] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** The listing as the URL describes it, after dropping invalid values. */
export interface ListingState {
  readonly q: string | null;
  /** `category=<slug>` (search page only; the category page takes it from the route). */
  readonly categorySlug: string | null;
  readonly minPrice: string | null;
  readonly maxPrice: string | null;
  readonly inStock: boolean;
  readonly seller: string | null;
  /** Minimum average rating (whole stars); unrated products never match [SPEC 06 §9.3]. */
  readonly rating: number | null;
  /** Attribute code → option codes, in the order given; checked against the category's attributes later. */
  readonly attributes: Readonly<Record<string, readonly string[]>>;
  /** Explicit sort; null means the default (best match with `q`, newest without). */
  readonly sort: SortKey | null;
}

function first(params: SearchParams, name: string): string | null {
  const value = params[name];
  const single = Array.isArray(value) ? value[0] : value;
  return single ?? null;
}

function money(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return fields.MONEY_PATTERN.test(trimmed) ? trimmed : null;
}

function searchText(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length >= Q_MIN_LENGTH && trimmed.length <= Q_MAX_LENGTH ? trimmed : null;
}

function attributesFrom(params: SearchParams): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const key of Object.keys(params)) {
    if (!key.startsWith(ATTRIBUTE_PARAM_PREFIX)) continue;
    const code = key.slice(ATTRIBUTE_PARAM_PREFIX.length);
    const values = [...new Set((first(params, key) ?? '').split(',').map((v) => v.trim()))];
    if (!CODE.test(code) || values.length === 0 || values.length > MAX_ATTRIBUTE_VALUES) continue;
    if (values.some((v) => !CODE.test(v))) continue;
    result[code] = values;
  }
  return result;
}

/** Reads and validates the URL (syntax only; attributes are checked against the category in `resolveListing`). */
export function parseListingParams(params: SearchParams): ListingState {
  const q = searchText(first(params, LISTING_PARAMS.q));
  let minPrice = money(first(params, LISTING_PARAMS.minPrice));
  let maxPrice = money(first(params, LISTING_PARAMS.maxPrice));
  if (minPrice !== null && maxPrice !== null && parseMoney(minPrice).greaterThan(parseMoney(maxPrice))) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  const seller = first(params, LISTING_PARAMS.seller);
  const sort = first(params, LISTING_PARAMS.sort);
  const validSort = sort !== null && Object.hasOwn(SORTS, sort) ? (sort as SortKey) : null;
  const categorySlug = first(params, LISTING_PARAMS.category);
  const rating = first(params, LISTING_PARAMS.rating);
  return {
    q,
    categorySlug: categorySlug !== null && CODE.test(categorySlug) ? categorySlug : null,
    minPrice,
    maxPrice,
    inStock: first(params, LISTING_PARAMS.inStock) === IN_STOCK_VALUE,
    seller: seller !== null && UUID.test(seller) ? seller : null,
    rating: rating !== null && RATING_PARAM.test(rating) ? Number(rating) : null,
    attributes: attributesFrom(params),
    sort: validSort === 'best-match' && q === null ? null : validSort,
  };
}

export function defaultSort(q: string | null): SortKey {
  return q === null ? 'newest' : 'best-match';
}

/** The sorts the UI may offer: "Best match" only with a search text. */
export function availableSorts(q: string | null): SortKey[] {
  return (Object.keys(SORTS) as SortKey[]).filter((key) => key !== 'best-match' || q !== null);
}

/**
 * Keeps only attribute filters the category really has (codes and option codes from
 * `GET /categories/{id}/attributes`, in the API's order), at most 5; without a category there are none.
 */
export function resolveAttributes(
  state: ListingState,
  categoryAttributes: readonly EffectiveAttribute[] | null,
): Record<string, string[]> {
  if (categoryAttributes === null) return {};
  const result: Record<string, string[]> = {};
  for (const attribute of categoryAttributes) {
    if (Object.keys(result).length === MAX_ATTRIBUTE_FILTERS) break;
    const wanted = Object.hasOwn(state.attributes, attribute.code)
      ? state.attributes[attribute.code]
      : undefined;
    if (wanted === undefined) continue;
    const known = new Set(attribute.options.map((option) => option.code));
    const values = wanted.filter((value) => known.has(value));
    if (values.length > 0) result[attribute.code] = values;
  }
  return result;
}

export interface ListingContext {
  /** The category in effect (route or `category=`), already resolved from the tree; null for none. */
  readonly categoryId: string | null;
  /** Its effective attributes; null when there is no category. */
  readonly categoryAttributes: readonly EffectiveAttribute[] | null;
}

/** The listing with everything checked: the single source for both the URL and the API query. */
export interface ResolvedListing extends ListingState {
  readonly categoryId: string | null;
  readonly attributes: Readonly<Record<string, readonly string[]>>;
  readonly sort: SortKey;
}

export function resolveListing(state: ListingState, context: ListingContext): ResolvedListing {
  return {
    ...state,
    categoryId: context.categoryId,
    attributes: resolveAttributes(state, context.categoryId === null ? null : context.categoryAttributes),
    sort: state.sort ?? defaultSort(state.q),
  };
}

/** The `GET /products` query of a listing (first page; the cursor is added per page, never in the URL). */
export function toProductQuery(listing: ResolvedListing, limit: number = PAGE_SIZE): ProductQueryInput {
  const input: ProductQueryInput = {
    limit,
    sort: SORTS[listing.sort],
    ...(listing.q === null ? {} : { q: listing.q }),
    ...(listing.categoryId === null ? {} : { 'categoryId[eq]': listing.categoryId }),
    ...(listing.minPrice === null ? {} : { 'price[gte]': listing.minPrice }),
    ...(listing.maxPrice === null ? {} : { 'price[lte]': listing.maxPrice }),
    ...(listing.inStock ? { 'inStock[eq]': true } : {}),
    ...(listing.seller === null ? {} : { 'sellerId[eq]': listing.seller }),
    ...(listing.rating === null ? {} : { 'rating[gte]': listing.rating }),
    ...(Object.keys(listing.attributes).length === 0 ? {} : { attributes: listing.attributes }),
  };
  // Throws on a combination the backend would refuse; resolveListing makes that impossible.
  productQuery(input);
  return input;
}

/** The canonical URL query of a listing (default sort omitted; the route category is not repeated). */
export function listingQueryString(listing: Omit<ResolvedListing, 'categoryId'>): string {
  const params = new URLSearchParams();
  if (listing.q !== null) params.set(LISTING_PARAMS.q, listing.q);
  if (listing.categorySlug !== null) params.set(LISTING_PARAMS.category, listing.categorySlug);
  if (listing.minPrice !== null) params.set(LISTING_PARAMS.minPrice, listing.minPrice);
  if (listing.maxPrice !== null) params.set(LISTING_PARAMS.maxPrice, listing.maxPrice);
  if (listing.inStock) params.set(LISTING_PARAMS.inStock, IN_STOCK_VALUE);
  if (listing.seller !== null) params.set(LISTING_PARAMS.seller, listing.seller);
  if (listing.rating !== null) params.set(LISTING_PARAMS.rating, String(listing.rating));
  for (const [code, values] of Object.entries(listing.attributes)) {
    params.set(`${ATTRIBUTE_PARAM_PREFIX}${code}`, values.join(','));
  }
  if (listing.sort !== defaultSort(listing.q)) params.set(LISTING_PARAMS.sort, listing.sort);
  return params.toString();
}

/** True when any filter is set (search text, category and seller don't count: "Clear all" keeps them). */
export function hasFilters(
  listing: Pick<ResolvedListing, 'minPrice' | 'maxPrice' | 'inStock' | 'rating' | 'attributes'>,
): boolean {
  return (
    listing.minPrice !== null ||
    listing.maxPrice !== null ||
    listing.inStock ||
    listing.rating !== null ||
    Object.keys(listing.attributes).length > 0
  );
}
