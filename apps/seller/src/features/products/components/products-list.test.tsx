// @vitest-environment jsdom
import { fixtureId, imageFactory, mockApi, sellerProductListItemFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { CATEGORY_ID, OTHER_CATEGORY_ID, serveCatalog, serveProfile } from './products.fixtures';
import { ProductsList } from './products-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

/** `GET /seller/products`: records each query; answers with `rows`. */
function serveProducts(rows: ReturnType<typeof sellerProductListItemFactory>[]) {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/seller/products',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok(rows, { nextCursor: null, hasMore: false, limit: 20 });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  serveCatalog(server);
});

describe('products list (spec 02 SE-08)', { timeout: 15_000 }, () => {
  it('rows: link, status, visibility, category path, price range, out of stock', async () => {
    serveProfile(server);
    serveProducts([
      sellerProductListItemFactory({
        name: 'Linen shirt',
        categoryId: OTHER_CATEGORY_ID,
        minPrice: '150.00',
        maxPrice: '210.00',
      }),
      sellerProductListItemFactory({
        name: 'Old mug',
        status: 'inactive',
        visible: false,
        inStock: false,
        categoryId: fixtureId(3999),
      }),
      sellerProductListItemFactory({
        name: 'Tea set',
        status: 'draft',
        visible: false,
        inStock: false,
        minPrice: null,
        maxPrice: null,
      }),
    ]);
    renderWithProviders(<ProductsList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Your products' });
    const shirt = (await within(table).findByRole('link', { name: 'Linen shirt' })).closest('tr');
    expect(shirt?.getAttribute('class')).toBeDefined();
    const shirtRow = within(shirt as HTMLElement);
    expect(shirtRow.getByText('Published')).toBeDefined();
    expect(shirtRow.getByText('Visible in store')).toBeDefined();
    expect(await shirtRow.findByText('Fashion › Shirts')).toBeDefined();
    expect(shirtRow.getByText(/150\.00.*210\.00/)).toBeDefined();

    const mug = within(within(table).getByRole('link', { name: 'Old mug' }).closest('tr') as HTMLElement);
    expect(mug.getByText('Unpublished')).toBeDefined();
    expect(mug.getByText('Hidden')).toBeDefined();
    expect(mug.getByText('Out of stock')).toBeDefined();
    expect(mug.getByText('Unavailable category')).toBeDefined();

    // No variants yet: no price and no "Out of stock".
    const draft = within(within(table).getByRole('link', { name: 'Tea set' }).closest('tr') as HTMLElement);
    expect(draft.getByText('—')).toBeDefined();
    expect(draft.queryByText('Out of stock')).toBeNull();
    expect(screen.getByRole('link', { name: 'Tea set' }).getAttribute('href')).toMatch(
      /^\/products\/01900000-/,
    );
  });

  it('rows: the main image as a thumbnail and "Blocked by Nile"', async () => {
    serveProfile(server);
    serveProducts([
      sellerProductListItemFactory({ name: 'Linen shirt', primaryImage: imageFactory() }),
      sellerProductListItemFactory({
        name: 'Fake watch',
        adminBlocked: true,
        adminBlockReason: 'Counterfeit',
      }),
    ]);
    renderWithProviders(<ProductsList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Your products' });
    const rowOf = (name: string) => within(table).getByRole('link', { name }).closest('tr') as HTMLElement;
    await within(table).findByRole('link', { name: 'Linen shirt' });
    expect(rowOf('Linen shirt').querySelector('img')?.getAttribute('src')).toMatch(/medium.webp$/);
    expect(within(rowOf('Linen shirt')).queryByText('Blocked by Nile')).toBeNull();
    expect(within(rowOf('Fake watch')).getByText('Blocked by Nile')).toBeDefined();
  });

  it('URL filters reach the API as literal keys; newest first, 20 per page', async () => {
    serveProfile(server);
    const queries = serveProducts([]);
    renderWithProviders(<ProductsList params={{ status: 'draft', category: CATEGORY_ID, name: 'mug' }} />);
    await screen.findByText('No products match these filters.');
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '20',
      sort: '-createdAt',
      'status[eq]': 'draft',
      'categoryId[eq]': CATEGORY_ID,
      'name[like]': 'mug',
    });
    expect(screen.getByRole('link', { name: 'Draft' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/products');
  });

  it('invalid URL values are dropped, never sent', async () => {
    serveProfile(server);
    const queries = serveProducts([]);
    renderWithProviders(<ProductsList params={{ status: 'deleted', category: 'abc' }} />);
    await screen.findByText("You haven't added any products yet.");
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({ limit: '20', sort: '-createdAt' });
  });

  it('tabs keep the other filters', async () => {
    serveProfile(server);
    serveProducts([]);
    renderWithProviders(<ProductsList params={{ name: 'mug' }} />);
    await screen.findByText('No products match these filters.');
    expect(screen.getByRole('link', { name: 'Published' }).getAttribute('href')).toBe(
      '/products?status=active&name=mug',
    );
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe('/products?name=mug');
  });

  it('the name search replaces the URL once typing pauses (400 ms)', async () => {
    serveProfile(server);
    serveProducts([]);
    const view = renderWithProviders(<ProductsList params={{ status: 'active' }} />);
    await view.user.type(await screen.findByRole('searchbox', { name: 'Search by name' }), ' red mug ');
    expect(router.replace).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledTimes(1);
    });
    expect(router.replace).toHaveBeenCalledWith('/products?status=active&name=red+mug');
  });

  it('the category filter navigates; "All categories" clears it', async () => {
    serveProfile(server);
    serveProducts([]);
    const view = renderWithProviders(<ProductsList params={{ category: CATEGORY_ID }} />);
    await screen.findByText('No products match these filters.');
    const select = screen.getByRole('combobox', { name: 'Category' });
    await vi.waitFor(() => {
      expect(select.hasAttribute('disabled')).toBe(false);
    });
    await view.user.click(select);
    await view.user.click(await screen.findByRole('option', { name: 'Fashion › Shirts' }));
    expect(router.push).toHaveBeenCalledWith(`/products?category=${OTHER_CATEGORY_ID}`);
    await view.user.click(select);
    await view.user.click(await screen.findByRole('option', { name: 'All categories' }));
    expect(router.push).toHaveBeenLastCalledWith('/products');
  });

  it('approved, nothing yet: empty state with "Add product"', async () => {
    serveProfile(server);
    serveProducts([]);
    renderWithProviders(<ProductsList params={{}} />);
    expect(await screen.findByText("You haven't added any products yet.")).toBeDefined();
    await vi.waitFor(() => {
      expect(screen.getAllByRole('link', { name: 'Add product' })).toHaveLength(2);
    });
    expect(screen.getAllByRole('link', { name: 'Add product' })[0]?.getAttribute('href')).toBe(
      '/products/new',
    );
  });

  it('not approved: no "Add product", the banner sentence in the empty state', async () => {
    serveProfile(server, 'pending_approval');
    serveProducts([]);
    renderWithProviders(<ProductsList params={{}} />);
    expect(await screen.findByText(/Your account is waiting for approval\./)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Add product' })).toBeNull();
  });

  it('load failure: error state with Try again', async () => {
    serveProfile(server);
    server.use(
      mockApi('get', '/seller/products', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<ProductsList params={{}} />);
    expect(await screen.findByText("Your products couldn't be loaded.")).toBeDefined();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDefined();
  });
});
