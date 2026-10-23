// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { ORDER_STATUS_LABELS } from '@nile/domain';
import { fixtureId, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrdersList } from './orders-list';

const server = setupMswServer();

type Summary = Schema<'OrderSummaryDto'>;

let sequence = 0;
function summary(overrides: Partial<Summary> = {}): Summary {
  sequence += 1;
  return {
    id: fixtureId(0x3000 + sequence),
    orderNumber: `NM-2026-${String(sequence).padStart(6, '0')}`,
    status: 'placed',
    paymentMethod: 'cod',
    total: '545.00',
    itemCount: 3,
    sellerOrderCount: 2,
    createdAt: '2026-10-14T07:30:00.000Z',
    ...overrides,
  };
}

/** `GET /orders` pages in turn; records each request's query. */
function serveOrders(...pages: { data: Summary[]; nextCursor: string | null }[]) {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/orders',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        const page = pages[Math.min(queries.length - 1, pages.length - 1)];
        if (page === undefined) throw new Error('no page');
        return reply.ok(page.data, {
          nextCursor: page.nextCursor,
          hasMore: page.nextCursor !== null,
          limit: 20,
        });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

describe('orders (spec 01 SF-17)', { timeout: 15_000 }, () => {
  it('rows: number, date, payment method, contents, status, total; link to the detail; newest first, 20 a page', async () => {
    const order = summary();
    const queries = serveOrders({ data: [order], nextCursor: null });
    renderWithProviders(<OrdersList tab={null} />);
    const link = await screen.findByRole('link', { name: new RegExp(`Order ${order.orderNumber}`) });
    expect(link.getAttribute('href')).toBe(`/account/orders/${order.id}`);
    expect(within(link).getByText('14 Oct 2026, 10:30 · Cash on delivery')).toBeDefined();
    expect(within(link).getByText('3 items from 2 sellers')).toBeDefined();
    expect(within(link).getByText('Placed')).toBeDefined();
    expect(within(link).getByText(/545\.00/)).toBeDefined();
    expect(queries[0]?.get('limit')).toBe('20');
    expect(queries[0]?.get('sort')).toBe('-createdAt');
    expect(queries[0]?.has('status[in]')).toBe(false);
  });

  it.each(Object.entries(ORDER_STATUS_LABELS.customer))(
    'status %s is labelled "%s"',
    async (status, label) => {
      serveOrders({ data: [summary({ status: status as Summary['status'] })], nextCursor: null });
      renderWithProviders(<OrdersList tab={null} />);
      expect(await screen.findByText(label, { selector: 'span' })).toBeDefined();
    },
  );

  it.each([
    ['awaiting-payment', 'pending_payment'],
    ['in-progress', 'placed,in_progress'],
    ['completed', 'completed,partially_completed'],
    ['cancelled', 'cancelled'],
  ])('tab %s asks for status[in]=%s and is marked current', async (tab, statuses) => {
    const queries = serveOrders({ data: [], nextCursor: null });
    renderWithProviders(<OrdersList tab={tab} />);
    expect(await screen.findByText('No orders here.')).toBeDefined();
    expect(queries[0]?.get('status[in]')).toBe(statuses);
    const nav = screen.getByRole('navigation', { name: 'Order status' });
    const current = within(nav)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.getAttribute('href'))).toEqual([`/account/orders?status=${tab}`]);
  });

  it('an unknown tab is "All"', async () => {
    const queries = serveOrders({ data: [], nextCursor: null });
    renderWithProviders(<OrdersList tab="shipped" />);
    expect(await screen.findByText("You haven't placed any orders yet.")).toBeDefined();
    expect(queries[0]?.has('status[in]')).toBe(false);
    expect(screen.getByRole('link', { name: 'Start shopping' }).getAttribute('href')).toBe('/');
  });

  it('"Load more" follows the cursor', async () => {
    const first = summary();
    const second = summary();
    const queries = serveOrders({ data: [first], nextCursor: 'c-2' }, { data: [second], nextCursor: null });
    const view = renderWithProviders(<OrdersList tab={null} />);
    await screen.findByText(`Order ${first.orderNumber}`);
    await view.user.click(screen.getByRole('button', { name: /Load more/ }));
    expect(await screen.findByText(`Order ${second.orderNumber}`)).toBeDefined();
    expect(queries[1]?.get('cursor')).toBe('c-2');
    expect(screen.queryByRole('button', { name: /Load more/ })).toBeNull();
  });

  it('a failed load offers a retry', async () => {
    server.use(
      mockApi('get', '/orders', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderWithProviders(<OrdersList tab={null} />);
    expect(await screen.findByText("Your orders couldn't be loaded.")).toBeDefined();
  });
});
