// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { mockApi, sellerOrderFactory, sellerProfileFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { Overview } from './overview';

const server = setupMswServer();

function serve(status: Schema<'SellerProfileDto'>['status']) {
  server.use(
    mockApi('get', '/seller/profile', ({ reply }) => reply.ok(sellerProfileFactory({ status })), {
      base: BFF_BASE,
    }),
  );
}

/** `GET /seller/orders` for the two queues, by `status[eq]`; records the queries. */
function serveQueues(placed: Schema<'SellerOrderDto'>[] = [], returning: Schema<'SellerOrderDto'>[] = []) {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/seller/orders',
      ({ request, reply }) => {
        const query = new URL(request.url).searchParams;
        queries.push(query);
        const rows = query.get('status[eq]') === 'placed' ? placed : returning;
        return reply.ok(rows, { nextCursor: null, hasMore: false, limit: 5 });
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

beforeEach(() => {
  serveQueues();
  server.use(
    mockApi('get', '/seller/finance/balance', ({ reply }) => reply.ok({ balance: '0.00', updatedAt: null }), {
      base: BFF_BASE,
    }),
  );
});

describe('overview balance (spec 02 SE-06 item 4, T-H5)', () => {
  it('no earnings yet, with a link to the finance page', async () => {
    serve('approved');
    renderWithProviders(<Overview />);
    expect(
      await screen.findByText('No earnings yet. Earnings are added when an order is delivered.'),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'View finance' }).getAttribute('href')).toBe('/finance');
  });
});

describe('overview order queues (spec 02 SE-06, T-H4)', () => {
  it('orders to confirm: oldest first, item count, subtotal, countdown; returns hidden when empty', async () => {
    serve('approved');
    const inFiveHours = new Date(Date.now() + 5 * 3_600_000).toISOString();
    const queries = serveQueues([sellerOrderFactory({ orderNumber: 'NM-1', acceptDeadlineAt: inFiveHours })]);
    renderWithProviders(<Overview />);
    const section = await screen.findByRole('region', { name: 'Orders to confirm' });
    const link = await within(section).findByRole('link', { name: 'Order NM-1' });
    expect(link.getAttribute('href')).toMatch(/^\/orders\/01900000-/);
    expect(within(section).getByText('2 items')).toBeDefined();
    expect(within(section).getByRole('timer').textContent).toMatch(/^[45] h \d\d min$/);
    expect(
      within(section).getByRole('link', { name: 'See all orders to confirm' }).getAttribute('href'),
    ).toBe('/orders?tab=to-confirm');
    const toConfirm = queries.find((query) => query.get('status[eq]') === 'placed');
    expect(Object.fromEntries(toConfirm ?? [])).toEqual({
      limit: '5',
      sort: 'createdAt',
      'status[eq]': 'placed',
    });
    await vi.waitFor(() => {
      expect(queries.some((query) => query.get('status[eq]') === 'returning_to_seller')).toBe(true);
    });
    expect(screen.queryByRole('region', { name: 'Returns to confirm' })).toBeNull();
  });

  it('nothing to confirm: the empty text; returns shown when there are some', async () => {
    serve('approved');
    serveQueues(
      [],
      [sellerOrderFactory({ orderNumber: 'NM-9', status: 'returning_to_seller', acceptDeadlineAt: null })],
    );
    renderWithProviders(<Overview />);
    expect(await screen.findByText('No orders waiting for you.')).toBeDefined();
    const returns = await screen.findByRole('region', { name: 'Returns to confirm' });
    expect(within(returns).getByRole('link', { name: 'Order NM-9' })).toBeDefined();
    expect(within(returns).queryByRole('timer')).toBeNull();
  });

  it('a queue that fails shows its own error', async () => {
    serve('approved');
    server.use(
      mockApi('get', '/seller/orders', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderWithProviders(<Overview />);
    expect((await screen.findAllByText("These orders couldn't be loaded.")).length).toBeGreaterThan(0);
  });
});

describe('overview checklist and shortcuts (spec 02 SE-06, T-H1)', () => {
  it('approved: "Add product" links to the new-product page; no checklist', async () => {
    serve('approved');
    renderWithProviders(<Overview />);
    const add = await screen.findByRole('link', { name: 'Add product' });
    expect(add.getAttribute('href')).toBe('/products/new');
    expect(screen.getByRole('link', { name: 'Orders' }).getAttribute('href')).toBe('/orders');
    expect(screen.getByRole('link', { name: 'Products' }).getAttribute('href')).toBe('/products');
    expect(screen.queryByRole('list', { name: 'Application progress' })).toBeNull();
  });

  it('pending approval: the checklist, and "Add product" disabled with the reason', async () => {
    serve('pending_approval');
    renderWithProviders(<Overview />);
    const checklist = await screen.findByRole('list', { name: 'Application progress' });
    expect(within(checklist).getByText('Email verified')).toBeDefined();
    expect(within(checklist).getByText('Waiting for admin review')).toBeDefined();
    const add = screen.getByRole('button', { name: 'Add product' });
    expect(add).toHaveProperty('disabled', true);
    expect(add.getAttribute('aria-describedby')).not.toBeNull();
    expect(document.getElementById(add.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      "Your account is waiting for approval. You can add products once you're approved.",
    );
  });

  it.each(['rejected', 'suspended'] as const)('%s: "Add product" disabled; no checklist', async (status) => {
    serve(status);
    renderWithProviders(<Overview />);
    await screen.findByText(status === 'rejected' ? /application was rejected/ : /account is suspended/);
    expect(screen.getByRole('button', { name: 'Add product' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('list', { name: 'Application progress' })).toBeNull();
  });

  it('while the profile loads, "Add product" stays disabled', () => {
    serve('approved');
    renderWithProviders(<Overview />);
    expect(screen.getByRole('button', { name: 'Add product' })).toHaveProperty('disabled', true);
  });
});
