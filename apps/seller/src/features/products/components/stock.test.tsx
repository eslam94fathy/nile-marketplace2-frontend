// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { mockApi, sellerProductFactory, sellerProfileFactory, sellerVariantFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ProductView } from './product-view';
import { OTHER_CATEGORY_ID, serveCatalog, serveProfile } from './products.fixtures';
import { VariantStockHistory } from './variant-stock-history';

// SE-12 (from the variants table) and SE-13, through the product feature that hosts them.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const server = setupMswServer();

type Product = Schema<'SellerProductDetailDto'>;

const VARIANT = sellerVariantFactory({ sku: 'MUG-1', stock: { onHand: 10, reserved: 2, sellable: 8 } });
const PRODUCT = sellerProductFactory({ name: 'Mug', categoryId: OTHER_CATEGORY_ID, variants: [VARIANT] });

/** The product page reads the product; opening the dialog reads it again. `next` is what later reads get. */
function serveProduct(first: Product, next: Product = first) {
  const state = { calls: 0 };
  server.use(
    mockApi(
      'get',
      '/seller/products/{productId}',
      ({ reply }) => {
        state.calls += 1;
        return reply.ok(state.calls === 1 ? first : next);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

interface Sent {
  readonly delta: number;
  readonly key: string | null;
}

/** Records body and Idempotency-Key; `answers` are used in order, the last one repeats. */
function serveAdjust(
  ...answers: (Schema<'VariantStockDto'> | { status: number; code: ErrorCode } | 'network')[]
) {
  const sent: Sent[] = [];
  server.use(
    http.post(`${BFF_BASE}/seller/variants/:variantId/stock-adjustments`, async ({ request }) => {
      const body = (await request.json()) as Schema<'StockAdjustmentDto'>;
      sent.push({ delta: body.delta, key: request.headers.get('Idempotency-Key') });
      const answer = answers[Math.min(sent.length - 1, answers.length - 1)];
      if (answer === 'network') return HttpResponse.error();
      if (answer === undefined || 'code' in answer) {
        const failure = answer ?? { status: 500, code: 'INTERNAL_ERROR' as const };
        return HttpResponse.json(
          { success: false, error: { code: failure.code, message: 'mocked' }, correlationId: 'c' },
          { status: failure.status },
        );
      }
      return HttpResponse.json({ success: true, data: answer });
    }),
  );
  return sent;
}

beforeEach(() => {
  serveProfile(server);
  serveCatalog(server);
});

const renderPage = () =>
  renderWithProviders(
    <>
      <ProductView productId={PRODUCT.id} />
      <Toaster />
    </>,
  );

type View = ReturnType<typeof renderPage>;

async function openAdjust(view: View) {
  const [button] = await screen.findAllByRole('button', { name: 'Adjust stock of MUG-1' }, { timeout: 5000 });
  if (button === undefined) throw new Error('no button');
  await vi.waitFor(() => {
    expect(button).toHaveProperty('disabled', false);
  });
  await view.user.click(button);
  const dialog = screen.getByRole('dialog', { name: 'Adjust stock · MUG-1' });
  await within(dialog).findByRole('textbox', { name: /^Quantity|^On-hand count/ });
  return dialog;
}

describe('stock adjustment (spec 02 SE-12)', { timeout: 20_000 }, () => {
  it('reads the stock again on opening; "set to" works from that read and states the delta', async () => {
    // Since the page loaded, 3 units were reserved and 2 delivered elsewhere.
    const fresh = { ...PRODUCT, variants: [{ ...VARIANT, stock: { onHand: 8, reserved: 5, sellable: 3 } }] };
    serveProduct(PRODUCT, fresh);
    const sent = serveAdjust({ variantId: VARIANT.id, onHand: 15, reserved: 5, sellable: 10 });
    const view = renderPage();
    const dialog = await openAdjust(view);
    expect(within(dialog).getByText('8', { selector: 'dd' })).toBeDefined();
    await view.user.click(within(dialog).getByRole('radio', { name: 'Set on-hand count to…' }));
    expect(within(dialog).getByText(/Use this after counting your shelf\./)).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^On-hand count/ }), '15');
    expect(within(dialog).getByText('This will add 7 units (on hand 8 → 15).')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Adjust stock' }));
    expect(await screen.findByText('Stock updated.')).toBeDefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.delta).toBe(7);
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('add / remove: the effect sentence equals the delta sent; the row shows the answer', async () => {
    serveProduct(PRODUCT);
    const sent = serveAdjust({ variantId: VARIANT.id, onHand: 7, reserved: 2, sellable: 5 });
    const view = renderPage();
    const dialog = await openAdjust(view);
    await view.user.click(within(dialog).getByRole('radio', { name: 'Remove' }));
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Quantity/ }), '3');
    expect(within(dialog).getByText('This will remove 3 units (on hand 10 → 7).')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Adjust stock' }));
    await vi.waitFor(() => {
      expect(sent.map((item) => item.delta)).toEqual([-3]);
    });
    // Table and phone card: both show the new on-hand count.
    await vi.waitFor(() => {
      expect(screen.getAllByText('7').length).toBeGreaterThan(0);
    });
  });

  it('removing more than the sellable units is blocked, with the reserved count', async () => {
    serveProduct(PRODUCT);
    const sent = serveAdjust({ variantId: VARIANT.id, onHand: 1, reserved: 2, sellable: 0 });
    const view = renderPage();
    const dialog = await openAdjust(view);
    await view.user.click(within(dialog).getByRole('radio', { name: 'Remove' }));
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Quantity/ }), '9');
    expect(
      await within(dialog).findByText(
        'You can remove at most 8 units: 2 units are reserved for open orders.',
      ),
    ).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Adjust stock' })).toHaveProperty('disabled', true);
    expect(sent).toEqual([]);
  });

  it('"set to" the current count: "No change needed." and nothing to submit', async () => {
    serveProduct(PRODUCT);
    const view = renderPage();
    const dialog = await openAdjust(view);
    await view.user.click(within(dialog).getByRole('radio', { name: 'Set on-hand count to…' }));
    await view.user.type(within(dialog).getByRole('textbox', { name: /^On-hand count/ }), '10');
    expect(await within(dialog).findByText('No change needed.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: 'Adjust stock' })).toHaveProperty('disabled', true);
  });

  it('a retry after a network failure reuses the key: never applied twice', async () => {
    serveProduct(PRODUCT);
    const sent = serveAdjust('network', { variantId: VARIANT.id, onHand: 15, reserved: 2, sellable: 13 });
    const view = renderPage();
    const dialog = await openAdjust(view);
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Quantity/ }), '5');
    await view.user.click(within(dialog).getByRole('button', { name: 'Adjust stock' }));
    expect(await within(dialog).findByRole('alert')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Adjust stock' }));
    // Earlier tests' toasts may still be up: wait for the dialog to close instead.
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).toBe(sent[0]?.key);
  });

  it('STOCK_ADJUSTMENT_INVALID: re-reads, explains; the next try is a new key from fresh numbers', async () => {
    // Opening reads 10 on hand / 2 reserved; meanwhile 7 more units get reserved.
    const fresh = { ...PRODUCT, variants: [{ ...VARIANT, stock: { onHand: 10, reserved: 9, sellable: 1 } }] };
    const state = serveProduct(PRODUCT);
    const sent = serveAdjust(
      { status: 422, code: 'STOCK_ADJUSTMENT_INVALID' },
      { variantId: VARIANT.id, onHand: 9, reserved: 9, sellable: 0 },
    );
    const view = renderPage();
    const dialog = await openAdjust(view);
    serveProduct(fresh, fresh);
    await view.user.click(within(dialog).getByRole('radio', { name: 'Remove' }));
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Quantity/ }), '5');
    await view.user.click(within(dialog).getByRole('button', { name: 'Adjust stock' }));
    expect(
      await within(dialog).findByText('Stock changed meanwhile. Please check the numbers and try again.'),
    ).toBeDefined();
    // The fresh numbers are shown and the typed amount is checked against them.
    expect(
      await within(dialog).findByText('You can remove at most 1 unit: 9 units are reserved for open orders.'),
    ).toBeDefined();
    const quantity = within(dialog).getByRole('textbox', { name: /^Quantity/ });
    await view.user.clear(quantity);
    await view.user.type(quantity, '1');
    await view.user.click(within(dialog).getByRole('button', { name: 'Adjust stock' }));
    await vi.waitFor(() => {
      expect(sent).toHaveLength(2);
    });
    expect(sent.map((item) => item.delta)).toEqual([-5, -1]);
    expect(sent[1]?.key).not.toBe(sent[0]?.key);
    expect(state.calls).toBeGreaterThanOrEqual(2);
  });

  it('SELLER_NOT_APPROVED: the status guidance as a toast', async () => {
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
    serveProduct(PRODUCT);
    serveAdjust({ status: 403, code: 'SELLER_NOT_APPROVED' });
    const view = renderPage();
    const dialog = await openAdjust(view);
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Quantity/ }), '1');
    await view.user.click(within(dialog).getByRole('button', { name: 'Adjust stock' }));
    expect((await screen.findAllByText(/Your account is suspended\./)).length).toBeGreaterThan(0);
  });

  it('not approved: "Adjust stock" disabled, "History" still open', async () => {
    serveProfile(server, 'suspended');
    serveProduct(PRODUCT);
    renderPage();
    const [history] = await screen.findAllByRole('link', { name: 'Stock history of MUG-1' });
    expect(history?.getAttribute('href')).toBe(`/products/${PRODUCT.id}/variants/${VARIANT.id}/stock`);
    await vi.waitFor(() => {
      expect(screen.getAllByText(/Your account is suspended\./).length).toBeGreaterThan(0);
    });
    for (const button of screen.getAllByRole('button', { name: 'Adjust stock of MUG-1' })) {
      expect(button).toHaveProperty('disabled', true);
    }
  });
});

describe('stock history (spec 02 SE-13)', { timeout: 15_000 }, () => {
  const movement = (overrides: Partial<Schema<'StockMovementDto'>>): Schema<'StockMovementDto'> => ({
    id: crypto.randomUUID(),
    type: 'seller_adjustment',
    quantityDelta: 5,
    onHandAfter: 10,
    reservedAfter: 0,
    referenceType: null,
    referenceId: null,
    createdAt: '2026-10-15T10:00:00.000Z',
    ...overrides,
  });

  function serveMovements(pages: Schema<'StockMovementDto'>[][]) {
    const queries: URLSearchParams[] = [];
    server.use(
      mockApi(
        'get',
        '/seller/variants/{variantId}/stock-movements',
        ({ request, reply }) => {
          const query = new URL(request.url).searchParams;
          queries.push(query);
          const index = query.get('cursor') === null ? 0 : 1;
          const hasMore = index < pages.length - 1;
          return reply.ok(pages[index] ?? [], { nextCursor: hasMore ? 'next' : null, hasMore, limit: 20 });
        },
        { base: BFF_BASE },
      ),
    );
    return queries;
  }

  it('labels, signed changes, "Order item"; newest first with "Load more"', async () => {
    serveProduct(PRODUCT);
    const queries = serveMovements([
      [
        movement({
          type: 'reserve',
          quantityDelta: -2,
          onHandAfter: 10,
          reservedAfter: 2,
          referenceType: 'order_item',
        }),
        movement({
          type: 'commit',
          quantityDelta: 0,
          onHandAfter: 8,
          reservedAfter: 0,
          referenceType: 'order_item',
        }),
      ],
      [movement({ quantityDelta: 10 })],
    ]);
    const view = renderWithProviders(<VariantStockHistory productId={PRODUCT.id} variantId={VARIANT.id} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Stock history · MUG-1' })).toBeDefined();
    expect(screen.getByText('Change shows the effect on sellable stock.')).toBeDefined();
    const table = await screen.findByRole('table', { name: 'Stock movements' });
    expect(within(table).getByText('Reserved for an order')).toBeDefined();
    expect(within(table).getByText('-2')).toBeDefined();
    expect(within(table).getByText('Delivered to the customer')).toBeDefined();
    expect(within(table).getAllByText('Order item')).toHaveLength(2);
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({ limit: '20', sort: '-createdAt' });
    await view.user.click(screen.getByRole('button', { name: /Load more/ }));
    expect(await within(table).findByText('+10')).toBeDefined();
    expect(within(table).getByText('Stock adjusted by you')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to the product' }).getAttribute('href')).toBe(
      `/products/${PRODUCT.id}`,
    );
  });

  it('no movements: empty state', async () => {
    serveProduct(PRODUCT);
    serveMovements([[]]);
    renderWithProviders(<VariantStockHistory productId={PRODUCT.id} variantId={VARIANT.id} />);
    expect(await screen.findByText('No stock movements yet.')).toBeDefined();
  });

  it('load failure: error state', async () => {
    serveProduct(PRODUCT);
    server.use(
      mockApi(
        'get',
        '/seller/variants/{variantId}/stock-movements',
        ({ reply }) => reply.error(500, 'INTERNAL_ERROR'),
        {
          base: BFF_BASE,
        },
      ),
    );
    renderWithProviders(<VariantStockHistory productId={PRODUCT.id} variantId={VARIANT.id} />);
    expect(await screen.findByText("The stock history couldn't be loaded.")).toBeDefined();
  });

  it("a variant that isn't this product's (or deleted): not found", async () => {
    serveProduct(PRODUCT);
    renderWithProviders(<VariantStockHistory productId={PRODUCT.id} variantId={crypto.randomUUID()} />);
    expect(await screen.findByText('This variant no longer exists.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to products' })).toBeDefined();
  });
});
