// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import {
  adminListItemFactory,
  adminOrderDetailFactory,
  adminShipmentFactory,
  mockApi,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrderDetail } from './order-detail';
import { OrdersList } from './orders-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Order = Schema<'AdminOrderDetailDto'>;

const ME = adminListItemFactory({ email: 'me@example.test' });
const ORDER = adminOrderDetailFactory();
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  server.use(
    mockApi('get', '/admin/admins', ({ reply }) => reply.ok([ME], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
    mockApi('get', '/admin/orders/{orderId}/payment', ({ reply }) => reply.error(404, 'PAYMENT_NOT_FOUND'), {
      base: BFF_BASE,
    }),
  );
});

function serveOrder(order: Order, shipments: Schema<'AdminShipmentDto'>[] = []) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi('get', '/admin/orders/{orderId}', ({ reply }) => reply.ok(order), { base: BFF_BASE }),
    mockApi(
      'get',
      '/admin/shipments',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(shipments, { ...PAGE, limit: 100 });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

const renderDetail = (order: Order = ORDER) =>
  renderWithProviders(<OrderDetail orderId={order.id} currentUserId={ME.id} />);

describe('orders list (spec 03 AD-14)', { timeout: 15_000 }, () => {
  it('opens on All, newest first; rows link to AD-15', async () => {
    const queries: Record<string, string>[] = [];
    server.use(
      mockApi(
        'get',
        '/admin/orders',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok(
            [
              {
                id: ORDER.id,
                orderNumber: ORDER.orderNumber,
                customerId: ORDER.customerId,
                status: 'placed',
                paymentMethod: 'cod',
                total: '300.00',
                itemCount: 2,
                sellerOrderCount: 1,
                createdAt: ORDER.createdAt,
              },
            ],
            PAGE,
          );
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<OrdersList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Orders' });
    expect(queries[0]).toEqual({ limit: '20', sort: '-createdAt' });
    expect(
      within(table)
        .getByRole('link', { name: `Order ${ORDER.orderNumber}` })
        .getAttribute('href'),
    ).toBe(`/orders/${ORDER.id}`);
    expect(within(table).getByText('Cash on delivery')).toBeDefined();
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('aria-current')).toBe('page');
  });

  it('the order number is searched exactly on "Find"', async () => {
    const user = userEvent.setup();
    server.use(mockApi('get', '/admin/orders', ({ reply }) => reply.ok([], PAGE), { base: BFF_BASE }));
    renderWithProviders(<OrdersList params={{}} />);
    await user.type(await screen.findByLabelText('Order number'), ' NM-2026-000001 ');
    expect(router.push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.push).toHaveBeenCalledWith('/orders?number=NM-2026-000001');
  });

  it('a customer filter shows with a way back', async () => {
    const queries: Record<string, string>[] = [];
    server.use(
      mockApi(
        'get',
        '/admin/orders',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<OrdersList params={{ status: 'all', customer: ORDER.customerId }} />);
    expect(await screen.findByText('No orders match these filters.')).toBeDefined();
    expect(queries[0]).toMatchObject({ 'customerId[eq]': ORDER.customerId });
    expect(screen.getByRole('link', { name: 'Show all customers' }).getAttribute('href')).toBe('/orders');
  });
});

describe('order (spec 03 AD-15)', { timeout: 15_000 }, () => {
  it('overview, address, totals, seller order with money, history and links; cancel actions', async () => {
    const shipment = adminShipmentFactory({
      orderId: ORDER.id,
      sellerOrderId: ORDER.sellerOrders[0]?.id ?? '',
    });
    const queries = serveOrder(ORDER, [shipment]);
    renderDetail();
    expect(
      await screen.findByRole('heading', { level: 1, name: `Order ${ORDER.orderNumber}` }, { timeout: 5000 }),
    ).toBeDefined();
    expect(screen.queryByText('To cancel, ask the seller or the customer.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cancel order' })).toBeDefined();
    expect(screen.getByRole('button', { name: "Cancel Nile Crafts's part" })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Other orders of this customer' }).getAttribute('href')).toBe(
      `/orders?status=all&customer=${ORDER.customerId}`,
    );
    expect(screen.getByText(/7 Victor Emmanuel, floor 3, Smouha, Alexandria, Alexandria/)).toBeDefined();
    const seller = screen.getByRole('article', { name: 'Nile Crafts' });
    expect(within(seller).getByRole('link', { name: 'Nile Crafts' }).getAttribute('href')).toBe(
      `/sellers/${ORDER.sellerOrders[0]?.sellerId ?? ''}`,
    );
    // Status badge and the timeline entry.
    expect(within(seller).getAllByText('Placed (awaiting seller)')).toHaveLength(2);
    expect(within(seller).getByText(/^10% \(EGP\s?25\.00\)$/)).toBeDefined();
    expect(within(seller).getByText('Size: Large')).toBeDefined();
    const [item] = ORDER.sellerOrders[0]?.items ?? [];
    // Items link to AD-27 (T-M4).
    expect(
      within(seller)
        .getByRole('link', { name: item?.productName ?? '' })
        .getAttribute('href'),
    ).toBe(`/products/${item?.productId ?? ''}`);
    expect(
      (await within(seller).findByRole('link', { name: 'Open the shipment' })).getAttribute('href'),
    ).toBe(`/delivery/shipments/${shipment.id}`);
    expect(within(seller).getByRole('link', { name: 'Ledger entries' }).getAttribute('href')).toBe(
      `/finance/lookup?referenceType=seller_order&referenceId=${ORDER.sellerOrders[0]?.id ?? ''}`,
    );
    expect(queries[0]).toMatchObject({ 'orderId[eq]': ORDER.id });
    const history = screen.getByRole('table', { name: 'Order status changes' });
    expect(within(history).getByText('Created → Placed')).toBeDefined();
    expect(within(history).getByText('Customer')).toBeDefined();
    expect(await screen.findByText('No payment record')).toBeDefined();
  });

  it('returns: returned quantity and sums, "Returns of this customer"; a return shipment is not the delivery', async () => {
    const [sellerOrder] = ORDER.sellerOrders;
    const [item] = sellerOrder?.items ?? [];
    if (sellerOrder === undefined || item === undefined) throw new Error('fixture');
    const order: Order = {
      ...ORDER,
      sellerOrders: [
        {
          ...sellerOrder,
          items: [{ ...item, returnedQuantity: 1 }],
          returnedPaid: '150.00',
          returnedSubtotal: '150.00',
          returnedCommission: '15.00',
          returnedSellerNet: '135.00',
        },
      ],
    };
    const returnShipment = adminShipmentFactory({
      orderId: order.id,
      sellerOrderId: sellerOrder.id,
      kind: 'return',
      returnId: ME.id,
    });
    serveOrder(order, [returnShipment]);
    renderDetail(order);
    const seller = await screen.findByRole('article', { name: 'Nile Crafts' }, { timeout: 5000 });
    expect(screen.getByRole('link', { name: 'Returns of this customer' }).getAttribute('href')).toBe(
      `/returns?customer=${order.customerId}`,
    );
    const items = within(seller).getByRole('table', { name: 'Items from Nile Crafts' });
    expect(within(items).getByRole('columnheader', { name: 'Returned' })).toBeDefined();
    expect(within(seller).getByText('Paid for returned items')).toBeDefined();
    expect(within(seller).getByText(/^EGP\s?135\.00$/)).toBeDefined();
    expect(await within(seller).findByText('No shipment yet')).toBeDefined();
    expect(within(seller).queryByRole('link', { name: 'Open the shipment' })).toBeNull();
  });

  it('a coupon: the items row before it, the coupon row, and the funded discount on the seller order', async () => {
    const [sellerOrder] = ORDER.sellerOrders;
    if (sellerOrder === undefined) throw new Error('fixture');
    const order: Order = {
      ...ORDER,
      itemsTotal: '230.00',
      coupon: { code: 'NILE20', discountTotal: '20.00' },
      sellerOrders: [{ ...sellerOrder, discountAmount: '20.00', discountFunding: 'platform' }],
    };
    serveOrder(order);
    renderDetail(order);
    const totals = await screen.findByRole('region', { name: 'Totals' }, { timeout: 5000 });
    expect(within(totals).getByText(/^EGP\s?250\.00$/)).toBeDefined();
    expect(within(totals).getByText('Coupon NILE20')).toBeDefined();
    const seller = screen.getByRole('article', { name: 'Nile Crafts' });
    expect(within(seller).getByText('Coupon discount · Funded by Nile')).toBeDefined();
  });

  it('a cancelled seller order shows the neutral cancel reason (OQ-16)', async () => {
    const [first] = ORDER.sellerOrders;
    if (first === undefined) throw new Error('fixture');
    serveOrder({
      ...ORDER,
      status: 'cancelled',
      sellerOrders: [{ ...first, status: 'cancelled', cancelReason: 'seller_cancelled' }],
    });
    renderDetail();
    expect(await screen.findByText('Cancelled by the seller', {}, { timeout: 5000 })).toBeDefined();
  });

  it('awaiting payment shows the deadline', async () => {
    serveOrder({
      ...ORDER,
      status: 'pending_payment',
      paymentMethod: 'kashier',
      paymentStatus: 'initiated',
      paymentExpiresAt: '2026-10-15T10:15:00.000Z',
    });
    renderDetail();
    expect(await screen.findByText('Pay by', {}, { timeout: 5000 })).toBeDefined();
  });

  it('an unknown order is "not found"', async () => {
    server.use(
      mockApi('get', '/admin/orders/{orderId}', ({ reply }) => reply.error(404, 'ORDER_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderDetail();
    expect(await screen.findByText("This order doesn't exist.", {}, { timeout: 5000 })).toBeDefined();
  });
});
