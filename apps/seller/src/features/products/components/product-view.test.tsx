// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import {
  fixtureId,
  mockApi,
  sellerProductFactory,
  sellerProfileFactory,
  sellerVariantFactory,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ProductView } from './product-view';
import { CATEGORY_ID, OTHER_CATEGORY_ID, serveCatalog, serveProfile } from './products.fixtures';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Product = Schema<'SellerProductDetailDto'>;

const DRAFT = sellerProductFactory({
  name: 'Linen shirt',
  description: 'Light and cool.',
  categoryId: OTHER_CATEGORY_ID,
});
const PUBLISHED: Product = {
  ...DRAFT,
  status: 'active',
  visible: true,
  slug: 'linen-shirt-abc123',
  minPrice: '150.00',
  maxPrice: '150.00',
  inStock: true,
  variants: [sellerVariantFactory({ sku: 'LS-1' })],
};

/** `GET /seller/products/{id}`: answers with `current()` so a test can change it; counts the calls. */
function serveProduct(initial: Product) {
  const state = { product: initial, calls: 0 };
  server.use(
    mockApi(
      'get',
      '/seller/products/{productId}',
      ({ reply }) => {
        state.calls += 1;
        return reply.ok(state.product);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

function serveAction(
  action: 'activate' | 'deactivate',
  answer: Product | { readonly status: number; readonly code: ErrorCode },
) {
  let calls = 0;
  server.use(
    mockApi(
      'post',
      `/seller/products/{productId}/${action}`,
      ({ reply }) => {
        calls += 1;
        return 'code' in answer ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return () => calls;
}

beforeEach(() => {
  router.push.mockReset();
  serveCatalog(server);
});

const renderPage = (productId = DRAFT.id) =>
  renderWithProviders(
    <>
      <ProductView productId={productId} />
      <Toaster />
    </>,
  );

describe('product page (spec 02 SE-10)', { timeout: 15_000 }, () => {
  it.each(['PRODUCT_NOT_FOUND', 'VALIDATION_FAILED'] as const)(
    '%s: not found, with a way back',
    async (code) => {
      serveProfile(server);
      server.use(
        mockApi(
          'get',
          '/seller/products/{productId}',
          ({ reply }) => reply.error(code === 'PRODUCT_NOT_FOUND' ? 404 : 400, code),
          {
            base: BFF_BASE,
          },
        ),
      );
      renderPage();
      expect(await screen.findByText("This product doesn't exist or was deleted.")).toBeDefined();
      expect(screen.getByRole('link', { name: 'Back to products' }).getAttribute('href')).toBe('/products');
    },
  );

  it('load failure: error state with Try again', async () => {
    serveProfile(server);
    server.use(
      mockApi('get', '/seller/products/{productId}', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderPage();
    expect(await screen.findByText("This product couldn't be loaded.")).toBeDefined();
  });

  it('published: status, visibility and "View in store" on the storefront', async () => {
    serveProfile(server);
    serveProduct(PUBLISHED);
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'Linen shirt' })).toBeDefined();
    expect(screen.getByText('Published')).toBeDefined();
    expect(screen.getByText('Visible in store')).toBeDefined();
    expect(screen.getByRole('link', { name: 'View in store' }).getAttribute('href')).toBe(
      'http://store.test/p/linen-shirt-abc123',
    );
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeDefined();
  });

  it('a draft without an active variant: Publish disabled with the reason; no store link', async () => {
    serveProfile(server);
    serveProduct({ ...DRAFT, variants: [sellerVariantFactory({ status: 'inactive' })] });
    renderPage();
    const publish = await screen.findByRole('button', { name: 'Publish' });
    await vi.waitFor(() => {
      expect(screen.getByText('Add at least one active variant first.')).toBeDefined();
    });
    expect(publish).toHaveProperty('disabled', true);
    expect(screen.queryByRole('link', { name: 'View in store' })).toBeNull();
  });

  it('Publish: the answer replaces the product', async () => {
    serveProfile(server);
    const ready = { ...DRAFT, variants: [sellerVariantFactory()] };
    serveProduct(ready);
    const calls = serveAction('activate', { ...ready, status: 'active', visible: true });
    const view = renderPage();
    const publish = await screen.findByRole('button', { name: 'Publish' });
    await vi.waitFor(() => {
      expect(publish).toHaveProperty('disabled', false);
    });
    await view.user.click(publish);
    expect(await screen.findByText('Product published.')).toBeDefined();
    expect(calls()).toBe(1);
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeDefined();
    expect(screen.getByText('Visible in store')).toBeDefined();
  });

  it.each([
    ['PRODUCT_INVALID_STATUS_TRANSITION', 'This product changed meanwhile. Here is its current state.'],
    ['PRODUCT_HAS_NO_ACTIVE_VARIANT', 'Add at least one active variant first.'],
  ] as const)('Publish refused with %s: refetch and explain', async (code, message) => {
    serveProfile(server);
    const state = serveProduct({ ...DRAFT, variants: [sellerVariantFactory()] });
    serveAction('activate', { status: 409, code });
    const view = renderPage();
    const publish = await screen.findByRole('button', { name: 'Publish' });
    await vi.waitFor(() => {
      expect(publish).toHaveProperty('disabled', false);
    });
    await view.user.click(publish);
    expect(await screen.findByText(message)).toBeDefined();
    await vi.waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('Unpublish asks first', async () => {
    serveProfile(server);
    serveProduct(PUBLISHED);
    const calls = serveAction('deactivate', { ...PUBLISHED, status: 'inactive', visible: false });
    const view = renderPage();
    await view.user.click(await screen.findByRole('button', { name: 'Unpublish' }));
    const dialog = screen.getByRole('dialog', { name: 'Unpublish' });
    expect(
      within(dialog).getByText("Hide this product from the store? Existing orders aren't affected."),
    ).toBeDefined();
    expect(calls()).toBe(0);
    await view.user.click(within(dialog).getByRole('button', { name: 'Unpublish' }));
    expect(await screen.findByText('Product unpublished.')).toBeDefined();
    expect(calls()).toBe(1);
    expect(screen.getByText('Unpublished')).toBeDefined();
  });

  it('Delete asks first, then goes back to the list', async () => {
    serveProfile(server);
    serveProduct(PUBLISHED);
    let deleted = 0;
    server.use(
      mockApi(
        'delete',
        '/seller/products/{productId}',
        ({ reply }) => {
          deleted += 1;
          return reply.noContent();
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderPage();
    await view.user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete product' });
    expect(
      within(dialog).getByText(
        "Delete Linen shirt and all its variants? This can't be undone. Past orders keep their details.",
      ),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText('Product deleted.')).toBeDefined();
    expect(deleted).toBe(1);
    expect(router.push).toHaveBeenCalledWith('/products');
  });

  it('details: only changed fields are sent', async () => {
    serveProfile(server);
    serveProduct(DRAFT);
    const bodies: Schema<'UpdateProductDto'>[] = [];
    server.use(
      mockApi(
        'patch',
        '/seller/products/{productId}',
        async ({ request, reply }) => {
          const body = (await request.json()) as Schema<'UpdateProductDto'>;
          bodies.push(body);
          return reply.ok({ ...DRAFT, ...body, updatedAt: '2026-10-15T10:00:00.000Z' });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderPage();
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save).toHaveProperty('disabled', true);
    const name = screen.getByRole('textbox', { name: /^Name/ });
    await view.user.clear(name);
    await view.user.type(name, ' Linen shirt, white ');
    await view.user.click(save);
    expect(await screen.findByText('Product saved.')).toBeDefined();
    expect(bodies).toEqual([{ name: 'Linen shirt, white' }]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Linen shirt, white' })).toBeDefined();
  });

  it('category: changeable without variants; locked with the reason once variants exist', async () => {
    serveProfile(server);
    serveProduct(PUBLISHED);
    renderPage();
    const select = await screen.findByRole('combobox', { name: /^Category/ });
    expect(select).toHaveProperty('disabled', true);
    expect(screen.getByText("The category can't be changed because the product has variants.")).toBeDefined();
  });

  it('PRODUCT_CATEGORY_LOCKED (a variant was added elsewhere): refetch, error on the category', async () => {
    serveProfile(server);
    const state = serveProduct(DRAFT);
    server.use(
      mockApi(
        'patch',
        '/seller/products/{productId}',
        ({ reply }) => reply.error(409, 'PRODUCT_CATEGORY_LOCKED'),
        {
          base: BFF_BASE,
        },
      ),
    );
    const view = renderPage();
    const select = await screen.findByRole('combobox', { name: /^Category/ });
    await vi.waitFor(() => {
      expect(select).toHaveProperty('disabled', false);
    });
    await view.user.click(select);
    await view.user.click(await screen.findByRole('option', { name: 'Fashion' }));
    state.product = { ...DRAFT, variants: [sellerVariantFactory()], updatedAt: '2026-10-15T11:00:00.000Z' };
    await view.user.click(screen.getByRole('button', { name: 'Save' }));
    await vi.waitFor(() => {
      expect(state.calls).toBe(2);
    });
    expect(await screen.findByRole('combobox', { name: /^Category/ })).toHaveProperty('disabled', true);
  });

  it('a deactivated category: "Unavailable category", details editable, variants blocked (SE-Q-2)', async () => {
    serveProfile(server);
    serveProduct({ ...DRAFT, categoryId: fixtureId(3999) });
    renderPage();
    expect(await screen.findByText('This category is no longer available. Contact support.')).toBeDefined();
    expect(screen.getByRole('combobox', { name: /^Category/ }).textContent).toContain('Unavailable category');
    expect(screen.queryByRole('button', { name: 'Add variant' })).toBeNull();
  });

  it('not approved: writes disabled with the banner sentence', async () => {
    serveProfile(server, 'suspended');
    // A category with options, so another variant could be added.
    serveProduct({ ...PUBLISHED, categoryId: CATEGORY_ID });
    renderPage();
    const unpublish = await screen.findByRole('button', { name: 'Unpublish' });
    await vi.waitFor(() => {
      expect(screen.getAllByText(/Your account is suspended\./).length).toBeGreaterThan(0);
    });
    expect(unpublish).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Add variant' })).toHaveProperty('disabled', true);
    // Table and phone cards are both in the DOM (CSS picks one).
    for (const edit of screen.getAllByRole('button', { name: 'Edit variant LS-1' })) {
      expect(edit).toHaveProperty('disabled', true);
    }
  });

  it('SELLER_NOT_APPROVED from a write: profile refetched, guidance toasted', async () => {
    let profileCalls = 0;
    server.use(
      mockApi(
        'get',
        '/seller/profile',
        ({ reply }) => {
          profileCalls += 1;
          return reply.ok(sellerProfileFactory({ status: profileCalls === 1 ? 'approved' : 'suspended' }));
        },
        { base: BFF_BASE },
      ),
    );
    serveProduct(PUBLISHED);
    serveAction('deactivate', { status: 403, code: 'SELLER_NOT_APPROVED' });
    const view = renderPage();
    // Generous waits: the full suite runs many jsdom files at once (flaked at the 1 s default once).
    const slow = { timeout: 5000 };
    const unpublish = await screen.findByRole('button', { name: 'Unpublish' }, slow);
    await vi.waitFor(() => {
      expect(unpublish).toHaveProperty('disabled', false);
    }, slow);
    await view.user.click(unpublish);
    await view.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unpublish' }));
    await vi.waitFor(() => {
      expect(profileCalls).toBeGreaterThanOrEqual(2);
    }, slow);
    // In the toast, and next to the controls the new status disables.
    expect((await screen.findAllByText(/Your account is suspended\./, {}, slow)).length).toBeGreaterThan(1);
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Unpublish' })).toHaveProperty('disabled', true);
    }, slow);
  });
});
