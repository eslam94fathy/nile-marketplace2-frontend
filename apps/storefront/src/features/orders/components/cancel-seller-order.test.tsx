// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { errorBody, fixtureId, mockApi, orderDetailFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrderDetail } from './order-detail';

vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => true }));

const server = setupMswServer();

type Order = Schema<'OrderDetailDto'>;
type SellerOrder = Order['sellerOrders'][number];

const ORDER_ID = fixtureId(0x900);
const SELLER_ORDER_ID = fixtureId(0x901);
const CANCEL_URL = `${BFF_BASE}/orders/${ORDER_ID}/seller-orders/${SELLER_ORDER_ID}/cancel`;

function sellerOrder(overrides: Partial<SellerOrder> = {}): SellerOrder {
  return {
    id: SELLER_ORDER_ID,
    sellerId: fixtureId(0x600),
    businessName: 'Nile Crafts',
    status: 'placed',
    subtotal: '500.00',
    canCancel: true,
    items: [],
    timeline: [],
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    ...orderDetailFactory({ id: ORDER_ID }),
    sellerOrders: [sellerOrder()],
    ...overrides,
  };
}

const CANCELLED = order({
  status: 'cancelled',
  deliveryFee: '0.00',
  total: '0.00',
  sellerOrders: [sellerOrder({ status: 'cancelled', canCancel: false })],
});

/** `GET /orders/{id}` answering in turn (the last repeats); returns the call count. */
function serveOrder(...answers: Order[]) {
  let calls = 0;
  server.use(
    mockApi(
      'get',
      '/orders/{orderId}',
      ({ reply }) => {
        const answer = answers[Math.min(calls, answers.length - 1)];
        calls += 1;
        if (answer === undefined) throw new Error('no answer');
        return reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return () => calls;
}

/** The cancel endpoint answering in turn; records body and key of each call. */
function serveCancel(...answers: (() => Response)[]) {
  const sent: { body: unknown; key: string | null }[] = [];
  server.use(
    http.post(CANCEL_URL, async ({ request }) => {
      sent.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') });
      const answer = answers[Math.min(sent.length - 1, answers.length - 1)];
      if (answer === undefined) throw new Error('no answer');
      return answer();
    }),
  );
  return sent;
}

const ok = () => HttpResponse.json({ success: true, data: CANCELLED });
const fail = (status: number, code: Parameters<typeof errorBody>[0]) => () =>
  HttpResponse.json(errorBody(code), { status });

function render() {
  return renderWithProviders(
    <>
      <OrderDetail orderId={ORDER_ID} />
      <Toaster />
    </>,
  );
}

async function openDialog(view: ReturnType<typeof render>) {
  await view.user.click(await screen.findByRole('button', { name: 'Cancel the items from Nile Crafts' }));
  return screen.findByRole('dialog', { name: 'Cancel these items' });
}

describe('cancel a seller order (spec 01 SF-18-A1)', { timeout: 15_000 }, () => {
  it('offered only when canCancel', async () => {
    serveOrder(order({ sellerOrders: [sellerOrder({ status: 'accepted', canCancel: false })] }));
    render();
    await screen.findByRole('region', { name: 'Sold by Nile Crafts' });
    expect(screen.queryByRole('button', { name: /Cancel the items/ })).toBeNull();
  });

  it('with a note: one POST with a key; the page shows the cancelled order from the answer', async () => {
    serveOrder(order());
    const sent = serveCancel(ok);
    const view = render();
    const dialog = await openDialog(view);
    expect(
      within(dialog).getByText("Cancel the items from Nile Crafts? This can't be undone."),
    ).toBeDefined();
    expect(within(dialog).queryByText(/refund/)).toBeNull();
    await view.user.type(
      within(dialog).getByRole('textbox', { name: 'Reason (optional)' }),
      '  Ordered by mistake ',
    );
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toEqual({ note: 'Ordered by mistake' });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    const block = screen.getByRole('region', { name: 'Sold by Nile Crafts' });
    expect(within(block).getByText('Cancelled')).toBeDefined();
    expect(within(block).queryByRole('button', { name: /Cancel the items/ })).toBeNull();
  });

  it('without a note: an empty body', async () => {
    serveOrder(order());
    const sent = serveCancel(ok);
    const view = render();
    const dialog = await openDialog(view);
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).toEqual({});
  });

  it('a note over 500 characters: field error, nothing sent', async () => {
    serveOrder(order());
    const sent = serveCancel(ok);
    const view = render();
    const dialog = await openDialog(view);
    const note = within(dialog).getByRole('textbox', { name: 'Reason (optional)' });
    await view.user.click(note);
    await view.user.paste('x'.repeat(501));
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    await waitFor(() => {
      expect(note.getAttribute('aria-invalid')).toBe('true');
    });
    expect(sent).toHaveLength(0);
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('card payment: the refund line', async () => {
    serveOrder(order({ paymentMethod: 'kashier', paymentStatus: 'paid' }));
    const view = render();
    const dialog = await openDialog(view);
    expect(
      within(dialog).getByText(
        "Cancel the items from Nile Crafts? This can't be undone. Your refund will be processed by our team.",
      ),
    ).toBeDefined();
  });

  it('a failure keeps the dialog; the retry reuses the key', async () => {
    serveOrder(order());
    const sent = serveCancel(fail(500, 'INTERNAL_ERROR'), ok);
    const view = render();
    const dialog = await openDialog(view);
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    expect(await within(dialog).findByRole('alert')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).toBe(sent[0]?.key);
  });

  it('SELLER_ORDER_NOT_CANCELLABLE: closes, explains, reloads the order', async () => {
    const calls = serveOrder(
      order(),
      order({ sellerOrders: [sellerOrder({ status: 'accepted', canCancel: false })] }),
    );
    serveCancel(fail(409, 'SELLER_ORDER_NOT_CANCELLABLE'));
    const view = render();
    const dialog = await openDialog(view);
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel items' }));
    expect(
      await screen.findByText(
        "The seller has already confirmed this part of your order, so it can't be cancelled here.",
        { exact: true },
      ),
    ).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Cancel the items/ })).toBeNull();
    });
    expect(calls()).toBe(2);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('"Keep them": nothing is sent', async () => {
    serveOrder(order());
    const sent = serveCancel(ok);
    const view = render();
    const dialog = await openDialog(view);
    await view.user.click(within(dialog).getByRole('button', { name: 'Keep them' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(sent).toHaveLength(0);
  });
});
