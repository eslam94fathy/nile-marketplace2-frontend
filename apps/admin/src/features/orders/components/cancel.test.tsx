// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { adminListItemFactory, adminOrderDetailFactory, fixtureId, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrderDetail } from './order-detail';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Order = Schema<'AdminOrderDetailDto'>;
type SellerOrder = Order['sellerOrders'][number];

const ME = adminListItemFactory({ email: 'me@example.test' });
const BASE = adminOrderDetailFactory();
const [CRAFTS] = BASE.sellerOrders;
if (CRAFTS === undefined) throw new Error('fixture');
const LINEN: SellerOrder = {
  ...CRAFTS,
  id: fixtureId(14600),
  businessName: 'Delta Linen',
  status: 'picked_up',
};
const ORDER: Order = { ...BASE, sellerOrders: [CRAFTS, LINEN] };
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

/** The order after the cancel: Nile Crafts' part cancelled by an admin. */
const AFTER: Order = {
  ...ORDER,
  sellerOrders: [{ ...CRAFTS, status: 'cancelled', cancelReason: 'admin_cancelled' }, LINEN],
};

beforeEach(() => {
  server.use(
    mockApi('get', '/admin/admins', ({ reply }) => reply.ok([ME], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
    mockApi('get', '/admin/orders/{orderId}/payment', ({ reply }) => reply.error(404, 'PAYMENT_NOT_FOUND'), {
      base: BFF_BASE,
    }),
    mockApi('get', '/admin/shipments', ({ reply }) => reply.ok([], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
  );
});

function serveOrder(initial: Order) {
  const state = { order: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/orders/{orderId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.order);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

const renderDetail = () =>
  renderWithProviders(
    <>
      <OrderDetail orderId={ORDER.id} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

describe('admin cancellation (spec 03 §7.3 AD-15 A1 / A2, T-M3)', { timeout: 20_000 }, () => {
  it('only parts still before pickup offer "Cancel this part"', async () => {
    serveOrder(ORDER);
    renderDetail();
    const crafts = await screen.findByRole('article', { name: 'Nile Crafts' }, { timeout: 5000 });
    expect(within(crafts).getByRole('button', { name: "Cancel Nile Crafts's part" })).toBeDefined();
    expect(within(screen.getByRole('article', { name: 'Delta Linen' })).queryByRole('button')).toBeNull();
  });

  it('nothing cancellable: no cancel buttons at all', async () => {
    serveOrder({ ...ORDER, sellerOrders: [LINEN] });
    renderDetail();
    await screen.findByRole('article', { name: 'Delta Linen' }, { timeout: 5000 });
    expect(screen.queryByRole('button', { name: /^Cancel/ })).toBeNull();
  });

  it('A1: reason required, a summary to confirm, sent once with a key; the answer replaces the order', async () => {
    const state = serveOrder(ORDER);
    const calls: { key: string | null; body: unknown; sellerOrderId: string }[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/seller-orders/{sellerOrderId}/cancel',
        async ({ request, params, reply }) => {
          calls.push({
            key: request.headers.get('Idempotency-Key'),
            body: await request.json(),
            sellerOrderId: String(params.sellerOrderId),
          });
          state.order = AFTER;
          return reply.ok(AFTER);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(
      await screen.findByRole('button', { name: "Cancel Nile Crafts's part" }, { timeout: 5000 }),
    );
    const dialog = screen.getByRole('dialog', { name: "Cancel Nile Crafts's part" });
    expect(within(dialog).getByText(/Stock is released, the shipment is cancelled/)).toBeDefined();
    expect(
      within(dialog).getByText("Only admins see this reason. The customer sees 'Cancelled by Nile'."),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), '  Seller closed  ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const confirm = screen.getByRole('dialog', { name: 'Confirm cancellation' });
    expect(within(confirm).getByText(/Reason: Seller closed$/)).toBeDefined();
    expect(calls).toEqual([]);
    await view.user.click(within(confirm).getByRole('button', { name: 'Cancel this part' }));
    expect(await screen.findByText("Nile Crafts's part was cancelled.")).toBeDefined();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ reason: 'Seller closed' });
    expect(calls[0]?.sellerOrderId).toBe(CRAFTS.id);
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    const crafts = screen.getByRole('article', { name: 'Nile Crafts' });
    expect(await within(crafts).findByText('Cancelled by an admin')).toBeDefined();
    expect(within(crafts).queryByRole('button', { name: /Cancel/ })).toBeNull();
  });

  it('a failed attempt keeps the key for the same intent; a changed reason is a new intent', async () => {
    serveOrder(ORDER);
    const keys: (string | null)[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/orders/{orderId}/cancel',
        ({ request, reply }) => {
          keys.push(request.headers.get('Idempotency-Key'));
          return keys.length < 3 ? reply.error(503, 'SERVICE_UNAVAILABLE') : reply.ok(AFTER);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Cancel order' }, { timeout: 5000 }));
    const dialog = screen.getByRole('dialog', { name: `Cancel order ${ORDER.orderNumber}` });
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    await view.user.type(reason, 'Fraud');
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await view.user.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect(await screen.findByRole('alert')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Cancel order' }));
    await vi.waitFor(() => {
      expect(keys).toHaveLength(2);
    });
    expect(keys[1]).toBe(keys[0]);
    await view.user.click(screen.getByRole('button', { name: 'Back' }));
    await view.user.type(reason, ' reports');
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await view.user.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect(await screen.findByText(`Order ${ORDER.orderNumber} was cancelled.`)).toBeDefined();
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('A2 refused: ORDER_NOT_CANCELLABLE names the blocking parts on the page and reads the order again', async () => {
    const state = serveOrder({ ...ORDER, sellerOrders: [CRAFTS, { ...LINEN, status: 'accepted' }] });
    server.use(
      mockApi(
        'post',
        '/admin/orders/{orderId}/cancel',
        ({ reply }) =>
          reply.error(409, 'ORDER_NOT_CANCELLABLE', {
            details: [
              {
                field: 'sellerOrderId',
                constraint: 'not_cancellable',
                message: 'seller order is picked_up',
                value: LINEN.id,
              },
            ],
          }),
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Cancel order' }, { timeout: 5000 }));
    await view.user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Customer request');
    await view.user.click(screen.getByRole('button', { name: 'Continue' }));
    const reads = state.reads;
    await view.user.click(screen.getByRole('button', { name: 'Cancel order' }));
    expect(
      await screen.findByText(
        "Nothing was cancelled because these parts can't be cancelled any more: Delta Linen. Cancel the others one by one.",
      ),
    ).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    await vi.waitFor(() => {
      expect(state.reads).toBeGreaterThan(reads);
    });
  });

  it('A1 refused: SELLER_ORDER_NOT_CANCELLABLE explains and reads the order again', async () => {
    const state = serveOrder(ORDER);
    server.use(
      mockApi(
        'post',
        '/admin/seller-orders/{sellerOrderId}/cancel',
        ({ reply }) => {
          state.order = { ...ORDER, sellerOrders: [{ ...CRAFTS, status: 'picked_up' }, LINEN] };
          return reply.error(409, 'SELLER_ORDER_NOT_CANCELLABLE');
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(
      await screen.findByRole('button', { name: "Cancel Nile Crafts's part" }, { timeout: 5000 }),
    );
    await view.user.type(screen.getByRole('textbox', { name: /^Reason/ }), 'Seller closed');
    await view.user.click(screen.getByRole('button', { name: 'Continue' }));
    await view.user.click(screen.getByRole('button', { name: 'Cancel this part' }));
    expect(
      await screen.findByText("This part has been picked up already, so it can't be cancelled."),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(screen.queryByRole('button', { name: "Cancel Nile Crafts's part" })).toBeNull();
    });
  });
});
