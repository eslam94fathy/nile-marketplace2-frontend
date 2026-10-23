import { serializeQuery } from '@nile/api';
import { describe, expect, it } from 'vitest';
import {
  availableSorts,
  hasFilters,
  listingQueryString,
  parseListingParams,
  resolveListing,
  toProductQuery,
  type EffectiveAttribute,
  type SearchParams,
} from './listing-params';

const CATEGORY_ID = '01900000-0000-7000-8000-000000000010';
const SELLER_ID = '01900000-0000-7000-8000-0000000000aa';

const attribute = (code: string, options: string[], sortOrder: number): EffectiveAttribute => ({
  id: `01900000-0000-7000-8000-0000000001${String(sortOrder).padStart(2, '0')}`,
  code,
  name: code.toUpperCase(),
  sortOrder,
  definedOnCategoryId: CATEGORY_ID,
  options: options.map((option, index) => ({
    id: `01900000-0000-7000-8000-00000000${String(sortOrder).padStart(2, '0')}${String(index).padStart(2, '0')}`,
    code: option,
    value: option,
    sortOrder: index,
  })),
});

const ATTRIBUTES = [
  attribute('size', ['s', 'm', 'l'], 1),
  attribute('color', ['red', 'blue'], 2),
  attribute('a3', ['x'], 3),
  attribute('a4', ['x'], 4),
  attribute('a5', ['x'], 5),
  attribute('a6', ['x'], 6),
];

/** What `GET /products` receives for a URL, as the API client serialises it. */
function apiQuery(params: SearchParams, categoryId: string | null = null): string {
  const listing = resolveListing(parseListingParams(params), {
    categoryId,
    categoryAttributes: categoryId === null ? null : ATTRIBUTES,
  });
  const { attributes, ...rest } = toProductQuery(listing);
  const attrs = Object.fromEntries(
    Object.entries(attributes ?? {}).map(([code, values]) => [`attr.${code}[in]`, values.join(',')]),
  );
  return decodeURIComponent(serializeQuery({ ...rest, ...attrs }));
}

describe('URL → GET /products (spec 01 SF-04)', () => {
  it('defaults: newest first, 20 per page', () => {
    expect(apiQuery({})).toBe('limit=20&sort=-publishedAt');
  });

  it('a search text sorts by best match by default, trimmed', () => {
    expect(apiQuery({ q: '  phone ' })).toBe('limit=20&sort=-relevance&q=phone');
  });

  it.each([['p'], [' a '], ['x'.repeat(101)]])('a search text outside 2..100 (%j) is dropped', (q) => {
    expect(apiQuery({ q })).toBe('limit=20&sort=-publishedAt');
  });

  it('never sends relevance without a search text', () => {
    expect(apiQuery({ sort: 'best-match' })).toBe('limit=20&sort=-publishedAt');
    expect(availableSorts(null)).toEqual(['newest', 'price-asc', 'price-desc']);
    expect(availableSorts('phone')).toEqual(['newest', 'price-asc', 'price-desc', 'best-match']);
  });

  it('maps every filter to its API parameter', () => {
    expect(
      apiQuery(
        {
          q: 'shirt',
          minPrice: '100',
          maxPrice: '250.5',
          inStock: '1',
          seller: SELLER_ID,
          sort: 'price-asc',
          'attr.size': 'm,l',
        },
        CATEGORY_ID,
      ),
    ).toBe(
      `limit=20&sort=minPrice&q=shirt&categoryId[eq]=${CATEGORY_ID}&price[gte]=100&price[lte]=250.5&inStock[eq]=true&sellerId[eq]=${SELLER_ID}&attr.size[in]=m,l`,
    );
  });

  it('swaps min and max when min is greater', () => {
    expect(apiQuery({ minPrice: '500', maxPrice: '100' })).toBe(
      'limit=20&sort=-publishedAt&price[gte]=100&price[lte]=500',
    );
  });

  it.each([
    ['minPrice', '-5'],
    ['minPrice', '1.234'],
    ['maxPrice', 'abc'],
    ['inStock', 'true'],
    ['seller', 'not-a-uuid'],
    ['sort', 'cheapest'],
    ['attr.Size', 'm'],
    ['attr.size', 'M,l'],
  ])('drops an invalid %s=%j', (key, value) => {
    expect(apiQuery({ [key]: value }, CATEGORY_ID)).toBe(
      `limit=20&sort=-publishedAt&categoryId[eq]=${CATEGORY_ID}`,
    );
  });

  it('never sends attribute filters without a category', () => {
    expect(apiQuery({ 'attr.size': 'm' })).toBe('limit=20&sort=-publishedAt');
  });

  it("keeps only the category's own codes and options, in the API's order, at most 5 attributes", () => {
    expect(
      apiQuery(
        {
          'attr.a6': 'x',
          'attr.unknown': 'x',
          'attr.color': 'green,red',
          'attr.size': 's',
          'attr.a3': 'x',
          'attr.a4': 'x',
          'attr.a5': 'x',
        },
        CATEGORY_ID,
      ),
    ).toBe(
      `limit=20&sort=-publishedAt&categoryId[eq]=${CATEGORY_ID}&attr.size[in]=s&attr.color[in]=red&attr.a3[in]=x&attr.a4[in]=x&attr.a5[in]=x`,
    );
  });

  it('drops an attribute with more than 20 values', () => {
    const values = Array.from({ length: 21 }, (_, i) => `v${i}`).join(',');
    expect(parseListingParams({ 'attr.size': values }).attributes).toEqual({});
  });

  it('takes the first value of a repeated parameter', () => {
    expect(apiQuery({ q: ['phone', 'laptop'] })).toBe('limit=20&sort=-relevance&q=phone');
  });
});

describe('listing → URL', () => {
  it('round-trips: the canonical URL parses back to the same listing', () => {
    const params = {
      q: 'shirt',
      category: 'tees',
      minPrice: '100',
      inStock: '1',
      'attr.size': 'm,l',
      sort: 'price-desc',
    };
    const listing = resolveListing(parseListingParams(params), {
      categoryId: CATEGORY_ID,
      categoryAttributes: ATTRIBUTES,
    });
    const query = listingQueryString(listing);
    expect(query).toBe('q=shirt&category=tees&minPrice=100&inStock=1&attr.size=m%2Cl&sort=price-desc');
    const again = resolveListing(parseListingParams(Object.fromEntries(new URLSearchParams(query))), {
      categoryId: CATEGORY_ID,
      categoryAttributes: ATTRIBUTES,
    });
    expect(again).toEqual(listing);
  });

  it('omits the default sort', () => {
    const listing = resolveListing(parseListingParams({ q: 'shirt', sort: 'best-match' }), {
      categoryId: null,
      categoryAttributes: null,
    });
    expect(listingQueryString(listing)).toBe('q=shirt');
  });

  it('knows when filters are set (search text, category and seller are not filters)', () => {
    const base = resolveListing(parseListingParams({ q: 'x1', seller: SELLER_ID }), {
      categoryId: null,
      categoryAttributes: null,
    });
    expect(hasFilters(base)).toBe(false);
    expect(hasFilters({ ...base, inStock: true })).toBe(true);
  });
});
