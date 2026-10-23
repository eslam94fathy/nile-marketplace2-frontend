// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { fixtureId, mockApi, sellerOrderFactory, sellerProfileFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrderDetail } from './order-detail';

const server = setupMswServer();

type Order = Schema<'SellerOrderDto'>;
type SellerStatus = Schema<'SellerProfileDto'>['status'];

const ORDER = sellerOrderFactory({ orderNumber: 'NM-7' });

function serveProfile(status: SellerStatus = 'approved') {
  server.use(
    mockApi('get', '/seller/profile', ({ reply }) => reply.ok(sellerProfileFactory({ status })), {
      base: BFF_BASE,
    }),
  );
}

/** The order as the API returns it now; `state.order` can change during a test. */
function serveOrder(order: Order) {
  const state = { order, calls: 0 };
  server.use(
    mockApi(
      'get',
      '/seller/orders/{sellerOrderId}',
      ({ reply }) => {
        state.calls += 1;
        return reply.ok(state.order);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

type Answer = Order | { readonly status: number; readonly code: ErrorCode };

interface Sent {
  readonly body: unknown;
  readonly key: string | null;
}

/** A seller-order action; answers in order (the last one repeats); records body and Idempotency-Key. */
function serveAction(
  path:
    | '/seller/orders/{sellerOrderId}/accept'
    | '/seller/orders/{sellerOrderId}/ready'
    | '/seller/orders/{sellerOrderId}/cancel'
    | '/seller/orders/{sellerOrderId}/return-received'
    | '/seller/orders/{sellerOrderId}/items/{itemId}/cancel',
  ...answers: Answer[]
) {
  const sent: Sent[] = [];
  server.use(
    mockApi(
      'post',
      path,
      async ({ request, reply }) => {
        const text = await request.text();
        sent.push({
          body: text === '' ? undefined : JSON.parse(text),
          key: request.headers.get('Idempotency-Key'),
        });
        const answer = answers[Math.min(sent.length - 1, answers.length - 1)];
        if (answer === undefined) return reply.error(500, 'INTERNAL_ERROR');
        return 'code' in answer ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return sent;
}

beforeEach(() => {
  serveProfile();
});

const renderPage = (order: Order = ORDER) =>
  renderWithProviders(
    <>
      <OrderDetail sellerOrderId={order.id} />
      <Toaster />
    </>,
  );

const heading = () => screen.findByRole('heading', { level: 1, name: /^Order NM-/ }, { timeout: 5000 });

describe('seller order (spec 02 SE-15)', { timeout: 20_000 }, () => {
  it.each(['SELLER_ORDER_NOT_FOUND', 'VALIDATION_FAILED'] as const)('%s: not found', async (code) => {
    server.use(
      mockApi(
        'get',
        '/seller/orders/{sellerOrderId}',
        ({ reply }) => reply.error(code === 'VALIDATION_FAILED' ? 400 : 404, code),
        { base: BFF_BASE },
      ),
    );
    renderPage();
    expect(await screen.findByText("This order doesn't exist or isn't yours.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to orders' }).getAttribute('href')).toBe('/orders');
  });

  it('placed: deadline, items, amounts, drop-off, timeline; Confirm, Cancel order, Cancel items', async () => {
    const deadline = new Date(Date.now() + 3 * 3_600_000).toISOString();
    serveOrder({ ...ORDER, acceptDeadlineAt: deadline });
    renderPage();
    await heading();
    expect(screen.getByText('New — confirm')).toBeDefined();
    expect(screen.getByText(/Unconfirmed orders are cancelled automatically after 24 hours\./)).toBeDefined();
    expect(screen.getByRole('timer').textContent).toMatch(/^[23] h \d\d min$/);
    const items = screen.getByRole('table', { name: 'Items in this order' });
    const product = within(items).getByRole('link', { name: 'Ordered product 1' });
    expect(product.getAttribute('href')).toMatch(/^\/products\/01900000-/);
    expect(within(items).getByText('Size: M')).toBeDefined();
    expect(screen.getByText("Nile's commission (10%)")).toBeDefined();
    expect(screen.getByText('Amounts are fixed at the time of the order.')).toBeDefined();
    expect(screen.getByText('Drop-off in Giza')).toBeDefined();
    expect(screen.getByText('Customer details are handled by the delivery agent.')).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Timeline' })).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Confirm order' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDefined();
    expect(within(items).getByRole('button', { name: 'Cancel items of Ordered product 1' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Mark ready for pickup' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm return received' })).toBeNull();
  });

  it.each([
    ['accepted', ['Mark ready for pickup', 'Cancel order'], true],
    ['ready_for_pickup', ['Cancel order'], true],
    ['returning_to_seller', ['Confirm return received'], false],
    ['picked_up', [], false],
    ['delivered', [], false],
  ] as const)('%s: only the allowed actions', async (status, buttons, itemCancel) => {
    serveOrder({ ...ORDER, status, acceptDeadlineAt: null });
    renderPage();
    await heading();
    for (const name of [
      'Confirm order',
      'Mark ready for pickup',
      'Cancel order',
      'Confirm return received',
    ]) {
      expect(screen.queryByRole('button', { name }) !== null).toBe(
        (buttons as readonly string[]).includes(name),
      );
    }
    expect(screen.queryByRole('button', { name: /^Cancel items of/ }) !== null).toBe(itemCancel);
  });

  it('cancelled: the reason, seller wording', async () => {
    serveOrder({
      ...ORDER,
      status: 'cancelled',
      cancelReason: 'seller_acceptance_timeout',
      cancelledAt: '2026-10-16T10:00:00.000Z',
      acceptDeadlineAt: null,
    });
    renderPage();
    await heading();
    expect(screen.getByText('Not confirmed within 24 hours')).toBeDefined();
    expect(within(screen.getByRole('region', { name: 'Timeline' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('Confirm order: the answer replaces the order', async () => {
    serveOrder(ORDER);
    const sent = serveAction('/seller/orders/{sellerOrderId}/accept', {
      ...ORDER,
      status: 'accepted',
      acceptedAt: '2026-10-15T11:00:00.000Z',
    });
    const view = renderPage();
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Confirm order' }));
    expect(await screen.findByText('Order confirmed.')).toBeDefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.key).toBeNull();
    expect(screen.getByText('Confirmed — prepare')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Mark ready for pickup' })).toBeDefined();
  });

  it('Confirm after the deadline, already cancelled by the backend: explained, refetched', async () => {
    const state = serveOrder({ ...ORDER, acceptDeadlineAt: new Date(Date.now() - 60_000).toISOString() });
    serveAction('/seller/orders/{sellerOrderId}/accept', {
      status: 409,
      code: 'SELLER_ORDER_INVALID_STATUS_TRANSITION',
    });
    const view = renderPage();
    await heading();
    state.order = {
      ...ORDER,
      status: 'cancelled',
      cancelReason: 'seller_acceptance_timeout',
      acceptDeadlineAt: null,
    };
    await view.user.click(screen.getByRole('button', { name: 'Confirm order' }));
    expect(
      await screen.findByText("This order was cancelled because it wasn't confirmed in time."),
    ).toBeDefined();
    expect(await screen.findByText('Not confirmed within 24 hours')).toBeDefined();
  });

  it('Mark ready asks first', async () => {
    const accepted = { ...ORDER, status: 'accepted' as const, acceptDeadlineAt: null };
    serveOrder(accepted);
    const sent = serveAction('/seller/orders/{sellerOrderId}/ready', {
      ...accepted,
      status: 'ready_for_pickup',
    });
    const view = renderPage(accepted);
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Mark ready for pickup' }));
    const dialog = screen.getByRole('dialog', { name: 'Mark ready for pickup' });
    expect(
      within(dialog).getByText(
        'Is the parcel packed and ready? A delivery agent will be assigned to collect it.',
      ),
    ).toBeDefined();
    expect(sent).toHaveLength(0);
    await view.user.click(within(dialog).getByRole('button', { name: 'Mark ready for pickup' }));
    expect(await screen.findByText('Marked ready for pickup.')).toBeDefined();
    expect(screen.getByText('Ready for pickup')).toBeDefined();
  });

  it('Cancel order: note sent trimmed; a retry after a failure reuses the key', async () => {
    serveOrder(ORDER);
    const sent = serveAction(
      '/seller/orders/{sellerOrderId}/cancel',
      { status: 503, code: 'SERVICE_UNAVAILABLE' },
      { ...ORDER, status: 'cancelled', cancelReason: 'seller_cancelled', acceptDeadlineAt: null },
    );
    const view = renderPage();
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Cancel order' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel order' });
    expect(
      within(dialog).getByText(
        'Cancel the whole order? The customer will be informed and the stock released.',
      ),
    ).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Note/ }), '  Out of stock  ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    expect(await within(dialog).findByRole('alert')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel order' }));
    expect(await screen.findByText('Order cancelled.')).toBeDefined();
    expect(sent.map((item) => item.body)).toEqual([{ note: 'Out of stock' }, { note: 'Out of stock' }]);
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(sent[1]?.key).toBe(sent[0]?.key);
    expect(screen.getByText('Cancelled by you')).toBeDefined();
  });

  it('Cancel order without a note sends {}; SELLER_ORDER_NOT_CANCELLABLE refetches and explains', async () => {
    const state = serveOrder({ ...ORDER, status: 'ready_for_pickup', acceptDeadlineAt: null });
    const sent = serveAction('/seller/orders/{sellerOrderId}/cancel', {
      status: 409,
      code: 'SELLER_ORDER_NOT_CANCELLABLE',
    });
    const view = renderPage();
    await heading();
    state.order = { ...ORDER, status: 'picked_up', acceptDeadlineAt: null };
    await view.user.click(screen.getByRole('button', { name: 'Cancel order' }));
    await view.user.click(
      within(screen.getByRole('dialog', { name: 'Cancel order' })).getByRole('button', {
        name: 'Cancel order',
      }),
    );
    expect(
      await screen.findByText("This order has been picked up and can't be cancelled any more."),
    ).toBeDefined();
    expect(sent[0]?.body).toEqual({});
    expect(await screen.findByText('Picked up')).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Confirm return received: asked first, idempotent', async () => {
    const returning = { ...ORDER, status: 'returning_to_seller' as const, acceptDeadlineAt: null };
    serveOrder(returning);
    const sent = serveAction('/seller/orders/{sellerOrderId}/return-received', {
      ...returning,
      status: 'returned_to_seller',
      returnedAt: '2026-10-17T09:00:00.000Z',
    });
    const view = renderPage(returning);
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Confirm return received' }));
    const dialog = screen.getByRole('dialog', { name: 'Confirm return received' });
    expect(
      within(dialog).getByText(
        'Confirm the returned parcel arrived? The items go back into your sellable stock.',
      ),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Confirm return received' }));
    expect(await screen.findByText('Return confirmed.')).toBeDefined();
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText('Returned')).toBeDefined();
  });

  it('pending approval: actions disabled with the reason; suspended: still allowed (open orders continue)', async () => {
    serveProfile('pending_approval');
    serveOrder(ORDER);
    const pending = renderPage();
    await heading();
    // Disabled even before the profile arrives; the reason appears once it has.
    expect(await screen.findByText(/Your account is waiting for approval\./)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirm order' })).toHaveProperty('disabled', true);
    pending.unmount();

    serveProfile('suspended');
    renderPage();
    await heading();
    await vi.waitFor(() => {
      expect(screen.getByRole('button', { name: 'Confirm order' })).toHaveProperty('disabled', false);
    });
  });
});

function firstItem(order: Order): Order['items'][number] {
  const [item] = order.items;
  if (item === undefined) throw new Error('order without items');
  return item;
}

describe('cancel items (spec 02 SE-15 A4)', { timeout: 20_000 }, () => {
  const mug = {
    ...firstItem(ORDER),
    id: fixtureId(9001),
    productName: 'Mug',
    quantity: 3,
    cancelledQuantity: 1,
  };
  const twoLines: Order = {
    ...ORDER,
    items: [
      mug,
      {
        ...firstItem(ORDER),
        id: fixtureId(9002),
        productName: 'Plate',
        quantity: 1,
        cancelledQuantity: 0,
      },
    ],
  };

  async function open(view: ReturnType<typeof renderPage>, product: string) {
    await heading();
    await view.user.click(screen.getByRole('button', { name: `Cancel items of ${product}` }));
    return screen.getByRole('dialog', { name: `Cancel items · ${product}` });
  }

  async function choose(view: ReturnType<typeof renderPage>, dialog: HTMLElement, reason: string) {
    await view.user.click(within(dialog).getByRole('combobox', { name: /^Reason/ }));
    await view.user.click(await screen.findByRole('option', { name: reason }));
  }

  it('shows "{n} cancelled · {m} still ordered"; quantity limited to the open units', async () => {
    serveOrder(twoLines);
    const sent = serveAction('/seller/orders/{sellerOrderId}/items/{itemId}/cancel', twoLines);
    const view = renderPage(twoLines);
    const dialog = await open(view, 'Mug');
    expect(screen.getAllByText('1 cancelled · 2 still ordered').length).toBeGreaterThan(0);
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Quantity to cancel/ }), '3');
    await choose(view, dialog, 'Out of stock');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    expect(await within(dialog).findByText('Enter a whole number from 1 to 2.')).toBeDefined();
    expect(sent).toHaveLength(0);
  });

  it('"Other" needs a note; the body carries quantity, reason and the trimmed note; idempotent', async () => {
    serveOrder(twoLines);
    const sent = serveAction('/seller/orders/{sellerOrderId}/items/{itemId}/cancel', twoLines);
    const view = renderPage(twoLines);
    const dialog = await open(view, 'Mug');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Quantity to cancel/ }), '1');
    await choose(view, dialog, 'Other');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    expect(await within(dialog).findByText('Add a note when the reason is Other.')).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Note/ }), ' damaged ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    expect(await screen.findByText('1 item cancelled.')).toBeDefined();
    expect(sent[0]?.body).toEqual({ quantity: 1, reason: 'other', note: 'damaged' });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('cancelling every open unit warns that the whole order is cancelled', async () => {
    const single: Order = { ...twoLines, items: [mug] };
    serveOrder(single);
    const view = renderPage(single);
    const dialog = await open(view, 'Mug');
    const quantity = within(dialog).getByRole('textbox', { name: /^Quantity to cancel/ });
    await view.user.type(quantity, '1');
    expect(within(dialog).queryByText('This cancels the whole order.')).toBeNull();
    await view.user.clear(quantity);
    await view.user.type(quantity, '2');
    expect(within(dialog).getByText('This cancels the whole order.')).toBeDefined();
  });

  it('ITEM_CANCEL_QUANTITY_INVALID: closes, explains, refetches', async () => {
    const state = serveOrder(twoLines);
    serveAction('/seller/orders/{sellerOrderId}/items/{itemId}/cancel', {
      status: 422,
      code: 'ITEM_CANCEL_QUANTITY_INVALID',
    });
    const view = renderPage(twoLines);
    const dialog = await open(view, 'Plate');
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Quantity to cancel/ }), '1');
    await choose(view, dialog, 'Seller request');
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    expect(
      await screen.findByText('The quantities changed meanwhile. Please check the order and try again.'),
    ).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    await vi.waitFor(() => {
      expect(state.calls).toBeGreaterThanOrEqual(2);
    });
  });
});
