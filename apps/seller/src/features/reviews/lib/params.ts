import { inValues } from '@nile/api';
import { cairoDayBounds, isCalendarDay } from '@nile/domain';
import * as z from 'zod';

// SE-20 filters, URL ⇄ API (spec 02 §8.3): `?product=&rating=4,5&replied=false&from=YYYY-MM-DD`, newest first.
// Values that aren't valid are dropped, never sent (R-28). The API offers `createdAt[gte]` only, so the date
// filter is a "from" Cairo day [VERIFIED OpenAPI].

export const REVIEW_LIST_PARAMS = {
  product: 'product',
  rating: 'rating',
  replied: 'replied',
  from: 'from',
} as const;

export const STAR_VALUES = [5, 4, 3, 2, 1] as const;
export type Stars = (typeof STAR_VALUES)[number];

export interface ReviewFilters {
  readonly productId: string | null;
  /** Ascending, no duplicates; empty for every rating. */
  readonly ratings: readonly Stars[];
  /** Only reviews without a reply. */
  readonly notReplied: boolean;
  /** Cairo calendar day `YYYY-MM-DD`. */
  readonly from: string | null;
}

export type RawReviewParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined): string | undefined =>
  typeof value === 'string' ? value : undefined;

const isStars = (value: number): value is Stars => (STAR_VALUES as readonly number[]).includes(value);

function parseRatings(value: string | undefined): Stars[] {
  if (value === undefined) return [];
  const ratings = new Set<Stars>();
  for (const part of value.split(',')) {
    const stars = Number(part);
    if (/^\d$/.test(part) && isStars(stars)) ratings.add(stars);
  }
  return [...ratings].sort((a, b) => a - b);
}

export function parseReviewFilters(params: RawReviewParams): ReviewFilters {
  const product = single(params[REVIEW_LIST_PARAMS.product]);
  const from = single(params[REVIEW_LIST_PARAMS.from]);
  return {
    productId: z.uuid().safeParse(product).success ? (product ?? null) : null,
    ratings: parseRatings(single(params[REVIEW_LIST_PARAMS.rating])),
    notReplied: single(params[REVIEW_LIST_PARAMS.replied]) === 'false',
    from: from !== undefined && isCalendarDay(from) ? from : null,
  };
}

/** The query string for filters (no `?`); empty for no filter. */
export function reviewFiltersQuery(filters: ReviewFilters): string {
  const query = new URLSearchParams();
  if (filters.productId !== null) query.set(REVIEW_LIST_PARAMS.product, filters.productId);
  if (filters.ratings.length > 0) query.set(REVIEW_LIST_PARAMS.rating, filters.ratings.join(','));
  if (filters.notReplied) query.set(REVIEW_LIST_PARAMS.replied, 'false');
  if (filters.from !== null) query.set(REVIEW_LIST_PARAMS.from, filters.from);
  return query.toString();
}

/** The API's literal filter keys. */
export function reviewApiQuery(filters: ReviewFilters) {
  return {
    ...(filters.productId === null ? {} : { 'productId[eq]': filters.productId }),
    ...(filters.ratings.length === 0 ? {} : { 'rating[in]': inValues(filters.ratings.map(String)) }),
    ...(filters.notReplied ? { 'replied[eq]': false } : {}),
    ...(filters.from === null ? {} : { 'createdAt[gte]': cairoDayBounds(filters.from).start }),
  };
}

export const hasReviewFilters = (filters: ReviewFilters): boolean =>
  filters.productId !== null || filters.ratings.length > 0 || filters.notReplied || filters.from !== null;
