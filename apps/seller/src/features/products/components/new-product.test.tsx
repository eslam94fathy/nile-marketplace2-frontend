// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { mockApi, sellerProductFactory, sellerProfileFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { NewProduct } from './new-product';
import { OTHER_CATEGORY_ID, serveCatalog, serveProfile, TREE } from './products.fixtures';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  serveCatalog(server);
});

function serveCreate(
  answer: 'ok' | { readonly status: number; readonly code: 'CATEGORY_NOT_FOUND' | 'SELLER_NOT_APPROVED' },
) {
  const bodies: Schema<'CreateProductDto'>[] = [];
  server.use(
    mockApi(
      'post',
      '/seller/products',
      async ({ request, reply }) => {
        const body = (await request.json()) as Schema<'CreateProductDto'>;
        bodies.push(body);
        if (answer !== 'ok') return reply.error(answer.status, answer.code);
        return reply.created(sellerProductFactory({ ...body }));
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

const renderPage = () =>
  renderWithProviders(
    <>
      <NewProduct />
      <Toaster />
    </>,
  );

async function fill(view: ReturnType<typeof renderPage>, category: string) {
  const select = await screen.findByRole('combobox', { name: /^Category/ });
  await vi.waitFor(() => {
    expect(select.hasAttribute('disabled')).toBe(false);
  });
  await view.user.click(select);
  await view.user.click(await screen.findByRole('option', { name: category }));
  await view.user.type(screen.getByRole('textbox', { name: /^Name/ }), '  Linen shirt ');
  await view.user.type(screen.getByRole('textbox', { name: /^Description/ }), 'Light and cool.');
}

describe('new product (spec 02 SE-09)', { timeout: 15_000 }, () => {
  it('creates a draft with trimmed fields and opens it', async () => {
    serveProfile(server);
    const bodies = serveCreate('ok');
    const view = renderPage();
    await fill(view, 'Fashion › Shirts');
    expect(
      screen.getByText('This category has no options: the product will have a single variant.'),
    ).toBeDefined();
    expect(screen.getByText("The category can't be changed once the product has variants.")).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Draft created. Add a variant to publish it.')).toBeDefined();
    expect(bodies).toEqual([
      { categoryId: OTHER_CATEGORY_ID, name: 'Linen shirt', description: 'Light and cool.' },
    ]);
    expect(router.push).toHaveBeenCalledWith(expect.stringMatching(/^\/products\/01900000-/));
  });

  it('names the options variants will need', async () => {
    serveProfile(server);
    const view = renderPage();
    const select = await screen.findByRole('combobox', { name: /^Category/ });
    await vi.waitFor(() => {
      expect(select.hasAttribute('disabled')).toBe(false);
    });
    await view.user.click(select);
    await view.user.click(await screen.findByRole('option', { name: 'Fashion' }));
    expect(await screen.findByText('Variants will need: Size, Color')).toBeDefined();
  });

  it('shows the description counter and validates before sending', async () => {
    serveProfile(server);
    const bodies = serveCreate('ok');
    const view = renderPage();
    await view.user.type(await screen.findByRole('textbox', { name: /^Description/ }), 'abc');
    expect(screen.getByText('3 / 5000 characters')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('Must be at least 2 characters.')).toBeDefined();
    expect(bodies).toEqual([]);
  });

  it('CATEGORY_NOT_FOUND: reloads the categories and asks again', async () => {
    serveProfile(server);
    serveCreate({ status: 422, code: 'CATEGORY_NOT_FOUND' });
    let treeCalls = 0;
    server.use(
      mockApi(
        'get',
        '/categories',
        ({ reply }) => {
          treeCalls += 1;
          return reply.ok(TREE);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderPage();
    await fill(view, 'Fashion');
    expect(treeCalls).toBe(1);
    await view.user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText('This category is no longer available.')).toBeDefined();
    await vi.waitFor(() => {
      expect(treeCalls).toBe(2);
    });
  });

  it('SELLER_NOT_APPROVED: the status guidance as a toast', async () => {
    let calls = 0;
    server.use(
      mockApi(
        'get',
        '/seller/profile',
        ({ reply }) => {
          calls += 1;
          return reply.ok(sellerProfileFactory({ status: calls === 1 ? 'approved' : 'suspended' }));
        },
        { base: BFF_BASE },
      ),
    );
    serveCreate({ status: 403, code: 'SELLER_NOT_APPROVED' });
    const view = renderPage();
    await fill(view, 'Fashion');
    await view.user.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByText(/Your account is suspended\./)).toBeDefined();
    // Not approved any more: back to the products list.
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/products');
    });
  });

  it.each(['pending_approval', 'rejected', 'suspended'] as const)(
    '%s: sent back to /products',
    async (status) => {
      serveProfile(server, status);
      renderPage();
      await vi.waitFor(() => {
        expect(router.replace).toHaveBeenCalledWith('/products');
      });
      expect(screen.queryByRole('button', { name: 'Create draft' })).toBeNull();
    },
  );
});
