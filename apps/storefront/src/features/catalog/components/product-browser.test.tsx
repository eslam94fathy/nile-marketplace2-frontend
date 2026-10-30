// @vitest-environment jsdom
import { mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import {
  parseListingParams,
  resolveListing,
  toProductQuery,
  type EffectiveAttribute,
  type SearchParams,
} from '../lib/listing-params';
import type { ProductListItem } from './product-card';
import { ProductBrowser, type ProductBrowserProps } from './product-browser';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const server = setupMswServer();

beforeEach(() => {
  push.mockReset();
});

const CATEGORY_ID = '01900000-0000-7000-8000-000000000010';
const SELLER = { id: '01900000-0000-7000-8000-0000000000aa', businessName: 'Nile Crafts' };

let sequence = 0;
function product(overrides: Partial<ProductListItem> = {}): ProductListItem {
  sequence += 1;
  return {
    id: `01900000-0000-7000-8000-${String(sequence).padStart(12, '0')}`,
    slug: `product-${sequence}`,
    name: `Product ${sequence}`,
    minPrice: '100.00',
    maxPrice: '100.00',
    inStock: true,
    primaryImage: null,
    rating: { avg: null, count: 0 },
    category: { id: CATEGORY_ID, name: 'Tees', slug: 'tees' },
    seller: SELLER,
    publishedAt: '2026-10-14T08:00:00.000Z',
    ...overrides,
  };
}

const SIZE: EffectiveAttribute = {
  id: '01900000-0000-7000-8000-000000000100',
  code: 'size',
  name: 'Size',
  sortOrder: 1,
  definedOnCategoryId: CATEGORY_ID,
  options: [
    { id: '01900000-0000-7000-8000-000000000101', code: 'm', value: 'M', sortOrder: 1 },
    { id: '01900000-0000-7000-8000-000000000102', code: 'l', value: 'L', sortOrder: 2 },
  ],
};

/** Serves pages in order; records each request's query string. */
function servePages(...pages: { data: ProductListItem[]; nextCursor: string | null }[]) {
  const queries: string[] = [];
  server.use(
    mockApi(
      'get',
      '/products',
      ({ request, reply }) => {
        const url = new URL(request.url);
        queries.push(decodeURIComponent(url.search));
        const page = pages[queries.length - 1] ?? { data: [], nextCursor: null };
        return reply.ok(page.data, {
          nextCursor: page.nextCursor,
          hasMore: page.nextCursor !== null,
          limit: 20,
        });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

function renderBrowser(params: SearchParams, extra: Partial<ProductBrowserProps> = {}, withCategory = true) {
  const listing = resolveListing(parseListingParams(params), {
    categoryId: withCategory ? CATEGORY_ID : null,
    categoryAttributes: withCategory ? [SIZE] : null,
  });
  return renderWithProviders(
    <ProductBrowser
      listing={listing}
      query={toProductQuery(listing)}
      basePath={withCategory ? '/c/tees' : '/search'}
      attributes={withCategory ? [SIZE] : null}
      {...extra}
    />,
  );
}

const lastPush = () => push.mock.calls.at(-1)?.[0] as string | undefined;

describe('product listing (spec 01 SF-04)', { timeout: 15_000 }, () => {
  it('cards: product link over the card, price or range, category, seller link, out-of-stock badge', async () => {
    servePages({
      data: [
        product({
          name: 'Linen shirt',
          slug: 'linen-shirt',
          minPrice: '250.00',
          maxPrice: '300.00',
          inStock: false,
        }),
      ],
      nextCursor: null,
    });
    renderBrowser({});
    const card = (await screen.findByRole('link', { name: 'Linen shirt' })).closest('article');
    if (card === null) throw new Error('no card');
    expect(within(card).getByRole('link', { name: 'Linen shirt' }).getAttribute('href')).toBe(
      '/p/linen-shirt',
    );
    expect(card.textContent).toMatch(/250\.00.*300\.00/);
    expect(within(card).getByText('Tees')).toBeDefined();
    expect(within(card).getByRole('link', { name: 'Nile Crafts' }).getAttribute('href')).toBe(
      `/search?seller=${SELLER.id}`,
    );
    expect(within(card).getByText('Out of stock')).toBeDefined();
  });

  it('"Load more" asks for the next cursor and appends without duplicates', async () => {
    const first = [product(), product()];
    const second = [product()];
    const queries = servePages({ data: first, nextCursor: 'c-2' }, { data: second, nextCursor: null });
    const view = renderBrowser({});
    await screen.findByRole('link', { name: first[0]?.name ?? '' });
    await view.user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('link', { name: second[0]?.name ?? '' })).toBeDefined();
    expect(screen.getAllByRole('article')).toHaveLength(3);
    expect(queries[1]).toContain('cursor=c-2');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('sort: "Best match" only with a search text; a choice goes into the URL', async () => {
    servePages({ data: [product()], nextCursor: null });
    const view = renderBrowser({}, {}, false);
    await view.user.click(await screen.findByRole('combobox', { name: 'Sort by' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Newest',
      'Price: low to high',
      'Price: high to low',
      'Top rated',
    ]);
    await view.user.click(screen.getByRole('option', { name: 'Price: high to low' }));
    expect(lastPush()).toBe('/search?sort=price-desc');
  });

  it('filters: in stock, attribute option, price range (validated) each go into the URL', async () => {
    servePages({ data: [product()], nextCursor: null }, { data: [product()], nextCursor: null });
    const view = renderBrowser({});
    const sidebar = await screen.findByRole('complementary', { name: 'Filters' });

    await view.user.click(within(sidebar).getByRole('checkbox', { name: 'In stock only' }));
    expect(lastPush()).toBe('/c/tees?inStock=1');
    await view.user.click(within(sidebar).getByRole('checkbox', { name: 'M' }));
    expect(lastPush()).toBe('/c/tees?attr.size=m');

    await view.user.type(within(sidebar).getByLabelText('Min'), '1.234');
    await view.user.click(within(sidebar).getByRole('button', { name: 'Apply' }));
    expect(within(sidebar).getByText('Enter an amount with up to 2 decimals.')).toBeDefined();
    await view.user.clear(within(sidebar).getByLabelText('Min'));
    await view.user.type(within(sidebar).getByLabelText('Min'), '100');
    await view.user.type(within(sidebar).getByLabelText('Max'), '250');
    await view.user.click(within(sidebar).getByRole('button', { name: 'Apply' }));
    expect(lastPush()).toBe('/c/tees?minPrice=100&maxPrice=250');
  });

  it('rating: "4 stars & up" goes into the URL, shows as a chip, "Any" and the chip remove it', async () => {
    servePages({ data: [product()], nextCursor: null }, { data: [product()], nextCursor: null });
    const view = renderBrowser({ rating: '3' });
    const sidebar = await screen.findByRole('complementary', { name: 'Filters' });
    const group = within(sidebar).getByRole('group', { name: 'Rating' });
    expect(within(group).getByRole('radio', { name: '3 stars & up' })).toHaveProperty('checked', true);
    await view.user.click(within(group).getByRole('radio', { name: '4 stars & up' }));
    expect(lastPush()).toBe('/c/tees?rating=4');
    await view.user.click(within(group).getByRole('radio', { name: 'Any' }));
    expect(lastPush()).toBe('/c/tees');
    const chips = screen.getByRole('list', { name: 'Active filters' });
    await view.user.click(within(chips).getByRole('button', { name: 'Remove filter: 3 stars & up' }));
    expect(lastPush()).toBe('/c/tees');
  });

  it('cards: the primary image (placeholder without one) and the rating only with reviews', async () => {
    servePages({
      data: [
        product({
          name: 'Linen shirt',
          rating: { avg: '4.50', count: 8 },
          primaryImage: {
            id: '01900000-0000-7000-8000-0000000000e1',
            urls: {
              thumb: 'https://media.test/t.webp',
              medium: 'https://media.test/m.webp',
              large: 'https://media.test/l.webp',
            },
            width: 1200,
            height: 1200,
          },
        }),
        product({ name: 'Wool scarf', slug: 'wool-scarf' }),
      ],
      nextCursor: null,
    });
    renderBrowser({});
    const shirt = (await screen.findByRole('link', { name: 'Linen shirt' })).closest('article');
    const scarf = screen.getByRole('link', { name: 'Wool scarf' }).closest('article');
    if (shirt === null || scarf === null) throw new Error('no card');
    const photo = within(shirt).getByRole('img', { name: 'Linen shirt' });
    expect(photo.getAttribute('src')).toBe('https://media.test/m.webp');
    expect(photo.getAttribute('loading')).toBe('eager');
    expect(within(shirt).getByText('Rated 4.5 out of 5 from 8 reviews')).toBeDefined();
    expect(within(scarf).getByRole('img', { name: 'Wool scarf' }).tagName.toLowerCase()).toBe('svg');
    expect(within(scarf).queryByText(/Rated|No reviews/)).toBeNull();
  });

  it('active filters show as removable chips; "Clear all" keeps the search text', async () => {
    servePages({ data: [product()], nextCursor: null });
    const view = renderBrowser({ q: 'shirt', minPrice: '100', inStock: '1', 'attr.size': 'm,l' });
    const chips = await screen.findByRole('list', { name: 'Active filters' });
    expect(
      within(chips)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      expect.stringMatching(/^Remove filter: From .*100\.00$/),
      'Remove filter: In stock',
      'Remove filter: Size: M',
      'Remove filter: Size: L',
    ]);
    await view.user.click(within(chips).getByRole('button', { name: 'Remove filter: Size: M' }));
    expect(lastPush()).toBe('/c/tees?q=shirt&minPrice=100&inStock=1&attr.size=l');
    await view.user.click(
      within(screen.getByRole('complementary', { name: 'Filters' })).getByRole('button', {
        name: 'Clear all',
      }),
    );
    expect(lastPush()).toBe('/c/tees?q=shirt');
  });

  it('search page: choosing a category drops the attribute filters of the previous one', async () => {
    servePages({ data: [product()], nextCursor: null });
    const view = renderBrowser(
      { q: 'shirt', category: 'tees', 'attr.size': 'm' },
      {
        basePath: '/search',
        categoryOptions: [
          { slug: 'tees', name: 'Tees', depth: 0 },
          { slug: 'polos', name: 'Polos', depth: 1 },
        ],
      },
    );
    await view.user.click(await screen.findByRole('combobox', { name: 'Category' }));
    await view.user.click(screen.getByRole('option', { name: /Polos/ }));
    expect(lastPush()).toBe('/search?q=shirt&category=polos');
  });

  it('empty: says so and offers to clear the filters', async () => {
    servePages({ data: [], nextCursor: null });
    const view = renderBrowser({ inStock: '1' });
    expect(await screen.findByText('No products match your search.')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(lastPush()).toBe('/c/tees');
  });

  it('INVALID_QUERY: resets to the defaults (keeping the search text)', async () => {
    server.use(
      mockApi('get', '/products', ({ reply }) => reply.error(400, 'INVALID_QUERY'), { base: BFF_BASE }),
    );
    renderBrowser({ q: 'shirt', inStock: '1', sort: 'price-asc' });
    await vi.waitFor(() => {
      expect(lastPush()).toBe('/c/tees?q=shirt');
    });
  });

  it('a failed load shows an error with "Try again"', async () => {
    let calls = 0;
    server.use(
      mockApi(
        'get',
        '/products',
        ({ reply }) => {
          calls += 1;
          return calls === 1
            ? reply.error(500, 'INTERNAL_ERROR')
            : reply.ok([product({ name: 'Recovered' })], { nextCursor: null, hasMore: false, limit: 20 });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderBrowser({});
    expect(await screen.findByText("Products couldn't be loaded.")).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Recovered' })).toBeDefined();
  });
});
