// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { SELLER_ORDER_STATUS_LABELS } from '@nile/domain';
import { fixtureId, mockApi, orderDetailFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrderDetail } from './order-detail';

vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => true }));

const server = setupMswServer();

type Order = Schema<'OrderDetailDto'>;
type SellerOrder = Order['sellerOrders'][number];
type Item = SellerOrder['items'][number];

const ORDER_ID = fixtureId(0x900);

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: fixtureId(0x902),
    productId: fixtureId(0x702),
    variantId: fixtureId(0x701),
    productName: 'Linen shirt',
    sku: 'LIN-M',
    attributes: [{ attribute: 'Size', value: 'M' }],
    unitPrice: '250.00',
    quantity: 2,
    cancelledQuantity: 0,
    lineTotal: '500.00',
    returnedQuantity: 0,
    discountAmount: '0.00',
    paidTotal: '500.00',
    image: null,
    ...overrides,
  };
}

function sellerOrder(overrides: Partial<SellerOrder> = {}): SellerOrder {
  return {
    id: fixtureId(0x901),
    sellerId: fixtureId(0x600),
    businessName: 'Nile Crafts',
    status: 'accepted',
    subtotal: '500.00',
    discountAmount: '0.00',
    discountFunding: null,
    returnedPaid: '0.00',
    cancelReason: null,
    canCancel: false,
    items: [item()],
    timeline: [
      { status: 'accepted', at: '2026-10-14T09:00:00.000Z' },
      { status: 'placed', at: '2026-10-14T07:30:00.000Z' },
    ],
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    ...orderDetailFactory({
      id: ORDER_ID,
      orderNumber: 'NM-2026-000001',
      createdAt: '2026-10-14T07:30:00.000Z',
    }),
    status: 'in_progress',
    sellerOrders: [sellerOrder()],
    ...overrides,
  };
}

function serveOrder(answer: Order | 'not-found') {
  server.use(
    mockApi(
      'get',
      '/orders/{orderId}',
      ({ reply }) => (answer === 'not-found' ? reply.error(404, 'ORDER_NOT_FOUND') : reply.ok(answer)),
      { base: BFF_BASE },
    ),
  );
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

describe('order detail (spec 01 SF-18)', { timeout: 15_000 }, () => {
  it('header, payment, address, seller blocks with items and history (oldest first), totals', async () => {
    serveOrder(order());
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Order NM-2026-000001' })).toBeDefined();
    expect(screen.getByText('Placed 14 Oct 2026, 10:30')).toBeDefined();
    expect(screen.getByText('In progress')).toBeDefined();
    expect(screen.getByText('Cash on delivery · To be paid on delivery')).toBeDefined();
    expect(screen.getByText('12, Abbas El Akkad, District 7, Nasr City, Cairo')).toBeDefined();
    const block = screen.getByRole('region', { name: 'Sold by Nile Crafts' });
    expect(within(block).getByRole('link', { name: 'Linen shirt' }).getAttribute('href')).toBe(
      `/p/${fixtureId(0x702)}`,
    );
    expect(within(block).getByText('SKU: LIN-M')).toBeDefined();
    expect(within(block).getByText(/250\.00 × 2/)).toBeDefined();
    const history = within(block).getAllByRole('listitem').slice(-2);
    expect(history.map((entry) => entry.textContent)).toEqual([
      'Waiting for seller confirmation14 Oct 2026, 10:30',
      'Confirmed by seller14 Oct 2026, 12:00',
    ]);
    expect(screen.getByText('Total').nextElementSibling?.textContent).toMatch(/545\.00/);
    expect(screen.queryByRole('button', { name: 'Pay now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Buy again' })).toBeNull();
  });

  it.each(Object.entries(SELLER_ORDER_STATUS_LABELS.customer))(
    'seller order %s is labelled "%s"',
    async (status, label) => {
      serveOrder(
        order({ sellerOrders: [sellerOrder({ status: status as SellerOrder['status'], timeline: [] })] }),
      );
      renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
      const block = await screen.findByRole('region', { name: 'Sold by Nile Crafts' });
      expect(within(block).getByText(label)).toBeDefined();
    },
  );

  it('with a coupon: items before the discount, the coupon row, the API total; paid line totals (T-K4)', async () => {
    serveOrder(
      order({
        itemsTotal: '450.00',
        deliveryFee: '45.00',
        total: '495.00',
        coupon: { code: 'SAVE10', discountTotal: '50.00' },
        sellerOrders: [
          sellerOrder({
            discountAmount: '50.00',
            discountFunding: 'platform',
            items: [item({ discountAmount: '50.00', paidTotal: '450.00' })],
          }),
        ],
      }),
    );
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    const totals = await screen.findByRole('region', { name: 'Total' });
    const row = (label: string) => within(totals).getByText(label).nextElementSibling?.textContent;
    // Added back for display only: 450.00 after the coupon + 50.00.
    expect(row('Items total')).toMatch(/500\.00/);
    expect(row('Coupon SAVE10')).toMatch(/^−.*50\.00$/);
    expect(row('Total')).toMatch(/495\.00/);
    const block = screen.getByRole('region', { name: 'Sold by Nile Crafts' });
    expect(within(block).getByText(/^Was .*500\.00$/)).toBeDefined();
    expect(within(block).getByText('Coupon discount').nextElementSibling?.textContent).toMatch(/^−.*50\.00$/);
  });

  it('without a coupon: no coupon rows, the line total as it is', async () => {
    serveOrder(order());
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    await screen.findByRole('region', { name: 'Total' });
    expect(screen.queryByText(/^Coupon/)).toBeNull();
    expect(screen.queryByText(/^Was /)).toBeNull();
  });

  it('items cancelled by the seller: the cancelled and open quantities', async () => {
    serveOrder(
      order({ sellerOrders: [sellerOrder({ items: [item({ quantity: 3, cancelledQuantity: 1 })] })] }),
    );
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByText('1 cancelled by the seller · 2 still ordered')).toBeDefined();
  });

  it('returned items: "{n} returned" (spec 01 §10.3, T-K8)', async () => {
    serveOrder(
      order({
        sellerOrders: [
          sellerOrder({ status: 'delivered', items: [item({ quantity: 3, returnedQuantity: 2 })] }),
        ],
      }),
    );
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByText('2 returned')).toBeDefined();
  });

  it.each([
    ['admin_cancelled', 'Cancelled by Nile'],
    ['seller_acceptance_timeout', 'Cancelled: the seller didn’t confirm in time'],
  ] as const)('a parcel cancelled with %s says "%s" (spec 01 §10.3)', async (cancelReason, text) => {
    serveOrder(order({ sellerOrders: [sellerOrder({ status: 'cancelled', cancelReason })] }));
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    const block = await screen.findByRole('region', { name: 'Sold by Nile Crafts' });
    expect(within(block).getByText(text)).toBeDefined();
  });

  it('awaiting card payment: countdown and Pay now before the deadline', async () => {
    serveOrder(
      order({
        status: 'pending_payment',
        paymentMethod: 'kashier',
        paymentStatus: 'initiated',
        paymentExpiresAt: inMinutes(10),
        sellerOrders: [sellerOrder({ status: 'pending_payment', timeline: [] })],
      }),
    );
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByRole('button', { name: 'Pay now' })).toBeDefined();
    expect(screen.getByRole('timer', { name: /^Time left to pay: / })).toBeDefined();
    expect(screen.getByText('Card (Kashier) · Awaiting payment')).toBeDefined();
  });

  it('awaiting payment after the deadline: no Pay now', async () => {
    serveOrder(
      order({
        status: 'pending_payment',
        paymentMethod: 'kashier',
        paymentStatus: 'initiated',
        paymentExpiresAt: inMinutes(-1),
      }),
    );
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Pay now' })).toBeNull();
  });

  it('cancelled with no delivery: both notes, and Buy again', async () => {
    serveOrder(
      order({
        status: 'cancelled',
        deliveryFee: '0.00',
        total: '0.00',
        sellerOrders: [sellerOrder({ status: 'cancelled' })],
      }),
    );
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect(
      await screen.findByText("Cancelled or returned parcels aren't included in the total."),
    ).toBeDefined();
    expect(screen.getByText('No delivery fee is charged because nothing was delivered.')).toBeDefined();
    expect(
      screen.queryByText(
        'Card refunds go back to your card automatically. Your bank may take a few days to show them.',
      ),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Buy again' })).toBeDefined();
  });

  it('paid by card with something cancelled: the refund note', async () => {
    serveOrder(
      order({
        paymentMethod: 'kashier',
        paymentStatus: 'paid',
        sellerOrders: [sellerOrder({ items: [item({ quantity: 2, cancelledQuantity: 1 })] })],
      }),
    );
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect(
      await screen.findByText(
        'Card refunds go back to your card automatically. Your bank may take a few days to show them.',
      ),
    ).toBeDefined();
  });

  it('someone else’s or an unknown order: not found', async () => {
    serveOrder('not-found');
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByRole('heading', { level: 1, name: /not found/i })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Your orders' }).getAttribute('href')).toBe('/account/orders');
  });

  it('a malformed id in the URL (VALIDATION_FAILED): not found, no retry (regression)', async () => {
    server.use(
      mockApi('get', '/orders/{orderId}', ({ reply }) => reply.error(400, 'VALIDATION_FAILED'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<OrderDetail orderId="not-an-order" />);
    expect(await screen.findByRole('heading', { level: 1, name: /not found/i })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Try again/ })).toBeNull();
  });

  it('a failed load offers a retry', async () => {
    server.use(
      mockApi('get', '/orders/{orderId}', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect(await screen.findByText("This order couldn't be loaded.")).toBeDefined();
  });
});
