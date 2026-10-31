// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import {
  adminProductFactory,
  adminSellerDetailFactory,
  fixtureId,
  mockApi,
  productImageFactory,
  productListItemFactory,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ProductDetail } from './product-detail';
import { StoreProducts } from './store-products';

const server = setupMswServer();

type Product = Schema<'AdminProductDetailDto'>;

const SELLER = adminSellerDetailFactory({ businessName: 'Nile Crafts' });
const PRODUCT = adminProductFactory({
  name: 'Linen shirt',
  sellerId: SELLER.id,
  categoryId: fixtureId(3002),
  images: [
    productImageFactory({ position: 1 }),
    productImageFactory({ position: 0, altText: 'Shirt, front' }),
  ],
});

const CATEGORY_TREE: Schema<'AdminCategoryNodeDto'>[] = [
  {
    id: fixtureId(3001),
    parentId: null,
    name: 'Fashion',
    slug: 'fashion',
    depth: 1,
    sortOrder: 1,
    isActive: true,
    image: null,
    attributes: [],
    children: [
      {
        id: fixtureId(3002),
        parentId: fixtureId(3001),
        name: 'Shirts',
        slug: 'shirts',
        depth: 2,
        sortOrder: 1,
        isActive: true,
        image: null,
        attributes: [],
        children: [],
      },
    ],
  },
];

beforeEach(() => {
  server.use(
    mockApi('get', '/admin/sellers/{sellerId}', ({ reply }) => reply.ok(SELLER), { base: BFF_BASE }),
    mockApi('get', '/admin/categories', ({ reply }) => reply.ok(CATEGORY_TREE), { base: BFF_BASE }),
  );
});

function serveProduct(initial: Product) {
  const state = { product: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/products/{productId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.product);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

const renderDetail = (product: Product = PRODUCT) =>
  renderWithProviders(
    <>
      <ProductDetail productId={product.id} />
      <Toaster />
    </>,
  );

describe('product (spec 03 AD-27, T-M4)', { timeout: 15_000 }, () => {
  it('details: seller, category path, variants with stock, images in order, store and reviews links', async () => {
    serveProduct(PRODUCT);
    renderDetail();
    expect(await screen.findByRole('heading', { level: 1, name: 'Linen shirt' })).toBeDefined();
    // The status badge and the "Published" date row.
    expect(screen.getAllByText('Published')).toHaveLength(2);
    expect(screen.getByText('In the store')).toBeDefined();
    expect((await screen.findByRole('link', { name: 'Nile Crafts' })).getAttribute('href')).toBe(
      `/sellers/${SELLER.id}`,
    );
    expect(await screen.findByText('Fashion › Shirts')).toBeDefined();
    const variants = screen.getByRole('table', { name: 'Variants' });
    expect(within(variants).getByText('Default')).toBeDefined();
    expect(within(variants).getByRole('cell', { name: '8' })).toBeDefined();
    const images = within(screen.getByRole('list', { name: 'Product images' })).getAllByRole('img');
    expect(images[0]?.getAttribute('alt')).toBe('Shirt, front');
    expect(images[1]?.getAttribute('alt')).toBe('Linen shirt');
    expect(screen.getByRole('link', { name: 'View in store' }).getAttribute('href')).toMatch(
      new RegExp(`/p/${PRODUCT.slug}$`),
    );
    expect(screen.getByRole('link', { name: 'Reviews' }).getAttribute('href')).toBe(
      `/reviews?product=${PRODUCT.id}`,
    );
    expect(screen.getByRole('button', { name: 'Block' })).toBeDefined();
  });

  it('not in the store: no "View in store"', async () => {
    serveProduct({ ...PRODUCT, visible: false, status: 'inactive' });
    renderDetail();
    expect(await screen.findByText('Not in the store')).toBeDefined();
    expect(screen.queryByRole('link', { name: 'View in store' })).toBeNull();
  });

  it('block: the spec warning, a required reason, the answer replaces the product', async () => {
    const state = serveProduct(PRODUCT);
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/products/{productId}/block',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          state.product = {
            ...PRODUCT,
            status: 'inactive',
            visible: false,
            adminBlocked: true,
            adminBlockReason: 'Counterfeit',
          };
          return reply.ok(state.product);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Block' }));
    const dialog = screen.getByRole('dialog', { name: 'Block product' });
    expect(
      within(dialog).getByText(
        "The product is hidden from the store at once and the seller can't publish it. Open orders continue.",
      ),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Block' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), ' Counterfeit ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Block' }));
    expect(await screen.findByText('Linen shirt is blocked.')).toBeDefined();
    expect(bodies).toEqual([{ reason: 'Counterfeit' }]);
    expect(await screen.findByText('Blocked by Nile')).toBeDefined();
    expect(screen.getByText('Counterfeit')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Unblock' })).toBeDefined();
  });

  it('unblock after confirming; PRODUCT_BLOCK_INVALID_STATUS reads it again', async () => {
    const blocked = { ...PRODUCT, adminBlocked: true, adminBlockReason: 'Counterfeit', visible: false };
    const state = serveProduct(blocked);
    server.use(
      mockApi(
        'post',
        '/admin/products/{productId}/unblock',
        ({ reply }) => {
          state.product = { ...blocked, adminBlocked: false, adminBlockReason: null };
          return reply.error(409, 'PRODUCT_BLOCK_INVALID_STATUS');
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail(blocked);
    await view.user.click(await screen.findByRole('button', { name: 'Unblock' }));
    const dialog = screen.getByRole('dialog', { name: 'Unblock product' });
    expect(
      within(dialog).getByText('The product stays unpublished until the seller publishes it again.'),
    ).toBeDefined();
    const reads = state.reads;
    await view.user.click(within(dialog).getByRole('button', { name: 'Unblock' }));
    expect(
      await screen.findByText('This product changed meanwhile. Here is its current state.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(state.reads).toBeGreaterThan(reads);
    });
    expect(await screen.findByRole('button', { name: 'Block' })).toBeDefined();
  });

  it('an unknown product is "not found"', async () => {
    server.use(
      mockApi('get', '/admin/products/{productId}', ({ reply }) => reply.error(404, 'PRODUCT_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderDetail();
    expect(await screen.findByText("This product doesn't exist.")).toBeDefined();
  });
});

describe('products in the store (spec 03 AD-05, T-M4)', { timeout: 15_000 }, () => {
  it('the public listing of this seller, newest first, each row → AD-27', async () => {
    const queries: Record<string, string>[] = [];
    const item = productListItemFactory({ name: 'Cotton scarf', inStock: false });
    server.use(
      mockApi(
        'get',
        '/products',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([item], { nextCursor: null, hasMore: false, limit: 12 });
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<StoreProducts sellerId={SELLER.id} />);
    const table = await screen.findByRole('table', { name: 'Products customers can see' });
    expect((await within(table).findByRole('link', { name: 'Cotton scarf' })).getAttribute('href')).toBe(
      `/products/${item.id}`,
    );
    expect(within(table).getByText('Out of stock')).toBeDefined();
    expect(queries[0]).toEqual({ limit: '12', sort: '-publishedAt', 'sellerId[eq]': SELLER.id });
  });
});
