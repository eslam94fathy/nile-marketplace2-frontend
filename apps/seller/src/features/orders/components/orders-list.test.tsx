// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { mockApi, sellerOrderFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrdersList } from './orders-list';

const server = setupMswServer();

function serveOrders(rows: Schema<'SellerOrderDto'>[]) {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/seller/orders',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok(rows, { nextCursor: null, hasMore: false, limit: 20 });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

describe('seller orders list (spec 02 SE-14)', { timeout: 15_000 }, () => {
  it('opens on "To confirm": placed, oldest first, with the countdown column', async () => {
    const inTwoHours = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const queries = serveOrders([
      sellerOrderFactory({ orderNumber: 'NM-1', acceptDeadlineAt: inTwoHours, paymentMethod: 'kashier' }),
    ]);
    renderWithProviders(<OrdersList tab={null} />);
    const table = await screen.findByRole('table', { name: 'Your orders' });
    const row = within(
      (await within(table).findByRole('link', { name: 'Order NM-1' })).closest('tr') as HTMLElement,
    );
    expect(row.getByText('New — confirm')).toBeDefined();
    expect(row.getByText('Paid by card')).toBeDefined();
    expect(row.getByText('2 items')).toBeDefined();
    expect(row.getByText('Giza')).toBeDefined();
    expect(row.getByRole('timer').textContent).toMatch(/^[12] h \d\d min$/);
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '20',
      sort: 'createdAt',
      'status[in]': 'placed',
    });
    expect(screen.getByRole('link', { name: 'To confirm' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'To confirm' }).getAttribute('href')).toBe('/orders');
    expect(screen.getByRole('link', { name: 'Returns' }).getAttribute('href')).toBe('/orders?tab=returns');
  });

  it('a history tab: its statuses, newest first, no countdown; net shown (SE-Q-8)', async () => {
    const queries = serveOrders([
      sellerOrderFactory({ orderNumber: 'NM-2', status: 'picked_up', acceptDeadlineAt: null }),
    ]);
    renderWithProviders(<OrdersList tab="in-delivery" />);
    const table = await screen.findByRole('table', { name: 'Your orders' });
    await within(table).findByRole('link', { name: 'Order NM-2' });
    expect(within(table).queryByRole('timer')).toBeNull();
    expect(within(table).getByText(/270\.00/)).toBeDefined();
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '20',
      sort: '-createdAt',
      'status[in]': 'picked_up,out_for_delivery,delivery_failed',
    });
  });

  it('"All": no status filter', async () => {
    const queries = serveOrders([]);
    renderWithProviders(<OrdersList tab="all" />);
    expect(await screen.findByText('No orders yet.')).toBeDefined();
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({ limit: '20', sort: '-createdAt' });
  });

  it('empty text per tab', async () => {
    serveOrders([]);
    renderWithProviders(<OrdersList tab={null} />);
    expect(await screen.findByText('No orders to confirm.')).toBeDefined();
  });

  it('load failure: error state', async () => {
    server.use(
      mockApi('get', '/seller/orders', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderWithProviders(<OrdersList tab={null} />);
    expect(await screen.findByText("Your orders couldn't be loaded.")).toBeDefined();
  });
});
