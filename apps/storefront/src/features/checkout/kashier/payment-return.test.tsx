// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { fixtureId, mockApi, orderDetailFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { kashierNavigation as navigation, PENDING_PAYMENT_ORDER_KEY } from '@/features/orders';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { PAYMENT_RETURN_POLL_MS } from '../lib/constants';
import { PaymentReturn } from './payment-return';

vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => true }));

const server = setupMswServer();

const EMPTY_CART: Schema<'CartDto'> = {
  id: fixtureId(0x500),
  sellers: [],
  itemsTotal: '0.00',
  itemCount: 0,
  hasIssues: false,
};

const MINUTE = 60_000;
const inMinutes = (minutes: number) => new Date(Date.now() + minutes * MINUTE).toISOString();

function cardOrder(overrides: Partial<Schema<'OrderDetailDto'>> = {}): Schema<'OrderDetailDto'> {
  const base = orderDetailFactory({
    paymentMethod: 'kashier',
    paymentStatus: 'initiated',
    status: 'pending_payment',
    paymentExpiresAt: inMinutes(10),
    placedAt: null,
    createdAt: inMinutes(-5),
  });
  return {
    ...base,
    sellerOrders: [
      {
        id: fixtureId(0x901),
        sellerId: fixtureId(0x600),
        businessName: 'Nile Crafts',
        status: 'pending_payment',
        subtotal: '500.00',
        discountAmount: '0.00',
        discountFunding: null,
        returnedPaid: '0.00',
        cancelReason: null,
        canCancel: false,
        timeline: [],
        items: [
          {
            id: fixtureId(0x902),
            productId: fixtureId(0x702),
            variantId: fixtureId(0x701),
            productName: 'Linen shirt',
            sku: 'LIN-M',
            attributes: [],
            unitPrice: '250.00',
            quantity: 2,
            cancelledQuantity: 0,
            lineTotal: '500.00',
            returnedQuantity: 0,
            discountAmount: '0.00',
            paidTotal: '500.00',
            image: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

/** `GET /orders/{orderId}` answering in turn (the last repeats); returns the number of calls. */
function serveOrder(...answers: Schema<'OrderDetailDto'>[]) {
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

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Kashier payment return (spec 01 SF-09)', { timeout: 20_000 }, () => {
  it('polls the stored order until it is placed, then says so and forgets the id', async () => {
    const order = cardOrder();
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, order.id);
    const calls = serveOrder(order, { ...order, status: 'placed', paymentStatus: 'paid' });
    renderWithProviders(<PaymentReturn />);
    expect(await screen.findByText('Confirming your payment…')).toBeDefined();
    expect(screen.getByRole('timer', { name: /^Time left to pay: / })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Pay now' })).toBeDefined();
    expect(
      await screen.findByText(
        `Payment received. Your order ${order.orderNumber} is placed.`,
        {},
        { timeout: PAYMENT_RETURN_POLL_MS + 2_000 },
      ),
    ).toBeDefined();
    expect(calls()).toBe(2);
    expect(screen.getByRole('region', { name: 'Sold by Nile Crafts' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'View order' }).getAttribute('href')).toBe(
      `/account/orders/${order.id}`,
    );
    expect(window.sessionStorage.getItem(PENDING_PAYMENT_ORDER_KEY)).toBeNull();
  });

  it('a tampered return URL never shows success: only the API decides', async () => {
    window.history.replaceState(null, '', '/checkout/payment-return?paymentStatus=SUCCESS&orderId=x');
    const order = cardOrder();
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, order.id);
    serveOrder(order);
    renderWithProviders(<PaymentReturn />);
    expect(await screen.findByText('Confirming your payment…')).toBeDefined();
    expect(screen.queryByText(/Payment received/)).toBeNull();
    window.history.replaceState(null, '', '/');
  });

  it('cancelled (not paid in time): says so, offers Buy again and Continue shopping', async () => {
    const order = cardOrder({ status: 'cancelled', paymentStatus: 'expired' });
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, order.id);
    serveOrder(order);
    renderWithProviders(<PaymentReturn />);
    expect(
      await screen.findByText("Your payment wasn't completed in time and the order was cancelled."),
    ).toBeDefined();
    expect(screen.getByRole('button', { name: 'Buy again' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Continue shopping' }).getAttribute('href')).toBe('/');
    expect(window.sessionStorage.getItem(PENDING_PAYMENT_ORDER_KEY)).toBeNull();
  });

  it('window closed but within the grace time: still confirming, no Pay now', async () => {
    const order = cardOrder({ paymentExpiresAt: inMinutes(-0.5) });
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, order.id);
    serveOrder(order);
    renderWithProviders(<PaymentReturn />);
    expect(await screen.findByText('Confirming your payment…')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Pay now' })).toBeNull();
  });

  it('past the grace time: stops polling and sends to the order page', async () => {
    const order = cardOrder({ paymentExpiresAt: inMinutes(-3) });
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, order.id);
    const calls = serveOrder(order);
    renderWithProviders(<PaymentReturn />);
    expect(
      await screen.findByText(
        "We're still waiting for confirmation from the payment provider. Check your order page in a few minutes.",
      ),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Go to your order' }).getAttribute('href')).toBe(
      `/account/orders/${order.id}`,
    );
    await new Promise((resolve) => setTimeout(resolve, PAYMENT_RETURN_POLL_MS + 500));
    expect(calls()).toBe(1);
  });

  it('no stored id: uses the newest open order when it is recent', async () => {
    const order = cardOrder();
    server.use(
      mockApi(
        'get',
        '/orders',
        ({ request, reply }) => {
          const query = new URL(request.url).searchParams;
          expect(query.get('status[in]')).toBe('pending_payment,placed');
          expect(query.get('limit')).toBe('1');
          expect(query.get('sort')).toBe('-createdAt');
          return reply.ok(
            [
              {
                id: order.id,
                orderNumber: order.orderNumber,
                status: 'pending_payment',
                paymentMethod: 'kashier',
                total: order.total,
                itemCount: 2,
                sellerOrderCount: 1,
                createdAt: order.createdAt,
              },
            ],
            { nextCursor: null, hasMore: false, limit: 1 },
          );
        },
        { base: BFF_BASE },
      ),
    );
    serveOrder(order);
    renderWithProviders(<PaymentReturn />);
    expect(await screen.findByText('Confirming your payment…')).toBeDefined();
  });

  it.each([
    ['an open order older than an hour', inMinutes(-61)],
    ['no open order', null],
  ])('no stored id and %s: "We couldn\'t find your order."', async (_, createdAt) => {
    server.use(
      mockApi(
        'get',
        '/orders',
        ({ reply }) =>
          reply.ok(
            createdAt === null
              ? []
              : [
                  {
                    id: fixtureId(0x950),
                    orderNumber: 'NM-2026-000009',
                    status: 'placed',
                    paymentMethod: 'kashier',
                    total: '545.00',
                    itemCount: 1,
                    sellerOrderCount: 1,
                    createdAt,
                  },
                ],
            { nextCursor: null, hasMore: false, limit: 1 },
          ),
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<PaymentReturn />);
    expect(await screen.findByText("We couldn't find your order.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Your orders' }).getAttribute('href')).toBe('/account/orders');
  });

  it.each([
    ['not (or no longer) the customer’s', 404, 'ORDER_NOT_FOUND'],
    ['malformed (regression)', 400, 'VALIDATION_FAILED'],
  ] as const)('a stored id that is %s: not found', async (_, status, code) => {
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, fixtureId(0x999));
    server.use(
      mockApi('get', '/orders/{orderId}', ({ reply }) => reply.error(status, code), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<PaymentReturn />);
    expect(await screen.findByText("We couldn't find your order.")).toBeDefined();
  });
});

describe('Pay now (spec 01 SF-18-A2)', { timeout: 15_000 }, () => {
  it('opens the session and leaves for Kashier', async () => {
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    const order = cardOrder();
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, order.id);
    serveOrder(order);
    server.use(
      mockApi(
        'post',
        '/orders/{orderId}/payment/kashier-session',
        ({ reply }) =>
          reply.ok({
            checkoutUrl: 'https://checkout.kashier.io/s/1',
            expiresAt: order.paymentExpiresAt ?? '',
          }),
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<PaymentReturn />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pay now' }));
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('https://checkout.kashier.io/s/1');
    });
  });

  it.each([
    ['ORDER_NOT_AWAITING_PAYMENT', 409, 'This order is no longer waiting for payment.', 2],
    [
      'PAYMENT_PROVIDER_UNAVAILABLE',
      502,
      "The payment provider isn't responding. Please try again in a moment.",
      1,
    ],
  ] as const)('%s: "%s"', async (code, status, message, orderLoads) => {
    const order = cardOrder();
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, order.id);
    const calls = serveOrder(order);
    server.use(
      mockApi('post', '/orders/{orderId}/payment/kashier-session', ({ reply }) => reply.error(status, code), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<PaymentReturn />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pay now' }));
    expect(await screen.findByText(message)).toBeDefined();
    // Only "no longer awaiting payment" reloads the order.
    await waitFor(() => {
      expect(calls()).toBe(orderLoads);
    });
  });
});

describe('Buy again (spec 01 SF-18-A3)', { timeout: 15_000 }, () => {
  it('confirms, adds each open item one at a time, then reports every item', async () => {
    const user = userEvent.setup();
    const base = cardOrder({ status: 'cancelled', paymentStatus: 'expired' });
    const first = base.sellerOrders[0];
    const line = first?.items[0];
    if (first === undefined || line === undefined) throw new Error('fixture');
    const order: Schema<'OrderDetailDto'> = {
      ...base,
      sellerOrders: [
        {
          ...first,
          items: [
            { ...line, quantity: 3, cancelledQuantity: 1 },
            { ...line, id: fixtureId(0x903), variantId: fixtureId(0x711), productName: 'Cotton scarf' },
            {
              ...line,
              id: fixtureId(0x904),
              variantId: fixtureId(0x712),
              productName: 'Gone',
              quantity: 1,
              cancelledQuantity: 1,
            },
          ],
        },
      ],
    };
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, order.id);
    serveOrder(order);
    const adds: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/cart/items',
        async ({ request, reply }) => {
          const body = (await request.json()) as { variantId: string };
          adds.push(body);
          return body.variantId === fixtureId(0x711)
            ? reply.error(409, 'INSUFFICIENT_STOCK')
            : reply.ok(EMPTY_CART);
        },
        { base: BFF_BASE },
      ),
      mockApi('get', '/cart', ({ reply }) => reply.ok(EMPTY_CART), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<PaymentReturn />);
    await user.click(await screen.findByRole('button', { name: 'Buy again' }));
    const confirm = await screen.findByRole('dialog', { name: 'Buy again' });
    expect(
      within(confirm).getByText('Add the items from this order to your cart? Current prices apply.'),
    ).toBeDefined();
    await user.click(within(confirm).getByRole('button', { name: 'Add to cart' }));
    const result = await screen.findByRole('dialog', { name: 'Items added to your cart' });
    expect(adds).toEqual([
      { variantId: line.variantId, quantity: 2 },
      { variantId: fixtureId(0x711), quantity: 2 },
    ]);
    expect(within(result).getByText('Added')).toBeDefined();
    expect(within(result).getByText('Not enough stock')).toBeDefined();
    expect(within(result).queryByText('Gone')).toBeNull();
    expect(within(result).getByRole('link', { name: 'Go to cart' }).getAttribute('href')).toBe('/cart');
  });
});
