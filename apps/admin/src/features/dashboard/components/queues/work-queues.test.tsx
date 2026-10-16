// @vitest-environment jsdom
import { adminOrderDetailFactory, mockApi, refundFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { DASHBOARD_QUEUES } from '../dashboard';
import { AwaitingCardPaymentQueue } from './awaiting-card-payment';
import { RefundsToRecordQueue } from './refunds-to-record';

const server = setupMswServer();
const PAGE = { nextCursor: null, hasMore: false, limit: 5 };

describe('dashboard: refunds and card payments (spec 03 AD-02, T-H10)', () => {
  it('queues 3 and 5 in spec order', () => {
    expect(DASHBOARD_QUEUES.indexOf(RefundsToRecordQueue)).toBe(2);
    expect(DASHBOARD_QUEUES.indexOf(AwaitingCardPaymentQueue)).toBe(4);
    expect(DASHBOARD_QUEUES.at(-1)).toBe(AwaitingCardPaymentQueue);
  });

  it('refunds to record: oldest first, linking to the order; "See all" to AD-16', async () => {
    const queries: URLSearchParams[] = [];
    const refund = refundFactory();
    server.use(
      mockApi(
        'get',
        '/admin/payments/refunds',
        ({ request, reply }) => {
          queries.push(new URL(request.url).searchParams);
          return reply.ok([refund], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<RefundsToRecordQueue />);
    const card = await screen.findByRole('region', { name: 'Refunds to record' });
    expect((await within(card).findByRole('link', { name: /100\.00/ })).getAttribute('href')).toBe(
      `/orders/${refund.orderId}`,
    );
    expect(within(card).getByText(/^Seller order cancelled, /)).toBeDefined();
    expect(within(card).getByRole('link', { name: 'See all refunds to record' }).getAttribute('href')).toBe(
      '/refunds',
    );
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '5',
      sort: 'createdAt',
      'status[eq]': 'pending_manual',
    });
  });

  it('orders awaiting card payment: oldest first → AD-15; "See all" to the Awaiting payment tab', async () => {
    const queries: URLSearchParams[] = [];
    const order = adminOrderDetailFactory({ status: 'pending_payment' });
    server.use(
      mockApi(
        'get',
        '/admin/orders',
        ({ request, reply }) => {
          queries.push(new URL(request.url).searchParams);
          return reply.ok(
            [
              {
                id: order.id,
                orderNumber: order.orderNumber,
                customerId: order.customerId,
                status: 'pending_payment',
                paymentMethod: 'kashier',
                total: order.total,
                itemCount: 2,
                sellerOrderCount: 1,
                createdAt: order.createdAt,
              },
            ],
            PAGE,
          );
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<AwaitingCardPaymentQueue />);
    const card = await screen.findByRole('region', { name: 'Orders awaiting card payment' });
    expect(
      (await within(card).findByRole('link', { name: `Order ${order.orderNumber}` })).getAttribute('href'),
    ).toBe(`/orders/${order.id}`);
    expect(
      within(card).getByRole('link', { name: 'See all orders awaiting payment' }).getAttribute('href'),
    ).toBe('/orders?status=awaiting-payment');
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '5',
      sort: 'createdAt',
      'status[eq]': 'pending_payment',
    });
  });
});
