// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { fixtureId, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { BalanceCard } from './balance-card';
import { FinanceView } from './finance-view';

const server = setupMswServer();

const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

function serveBalance(balance: Schema<'SellerBalanceDto'>) {
  server.use(mockApi('get', '/seller/finance/balance', ({ reply }) => reply.ok(balance), { base: BFF_BASE }));
}

function entry(overrides: Partial<Schema<'LedgerEntryDto'>>): Schema<'LedgerEntryDto'> {
  return {
    id: fixtureId(8100),
    direction: 'credit',
    amount: '270.00',
    balanceAfter: '270.00',
    entryType: 'seller_net_earned',
    referenceType: 'seller_order',
    referenceId: fixtureId(7001),
    createdAt: '2026-10-15T12:00:00.000Z',
    ...overrides,
  };
}

function serveEntries(rows: Schema<'LedgerEntryDto'>[]) {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/seller/finance/entries',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

function servePayouts(rows: Schema<'PayoutDto'>[]) {
  server.use(
    mockApi('get', '/seller/finance/payouts', ({ reply }) => reply.ok(rows, PAGE), { base: BFF_BASE }),
  );
}

function serveHolds(rows: Schema<'SellerHoldDto'>[] | 'error') {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/seller/finance/holds',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return rows === 'error' ? reply.error(500, 'INTERNAL_ERROR') : reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('balance (spec 02 SE-16, SE-06)', () => {
  it('"0.00" with no update yet: no earnings yet (the overview explains when they come)', async () => {
    serveBalance({ pending: '0.00', available: '0.00', updatedAt: null });
    renderWithProviders(<BalanceCard variant="overview" />);
    expect(
      await screen.findByText('No earnings yet. Earnings are added when an order is delivered.'),
    ).toBeDefined();
    expect(screen.getByText('Balances update a few moments after a delivery.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'View finance' }).getAttribute('href')).toBe('/finance');
  });

  it('a balance: the amount and when it was last updated; 0.00 after payouts is still a balance', async () => {
    serveBalance({ pending: '0.00', available: '0.00', updatedAt: '2026-10-15T12:00:00.000Z' });
    renderWithProviders(<BalanceCard variant="finance" />);
    expect(await screen.findByText(/^Last updated /)).toBeDefined();
    expect(screen.getAllByText(/0\.00/)).toHaveLength(2);
    expect(screen.queryByText(/No earnings yet/)).toBeNull();
    expect(screen.getByText(/Nile pays you outside the app and records each payout here\./)).toBeDefined();
  });

  it('available and pending side by side (holding period, spec 02 §8.3)', async () => {
    serveBalance({ available: '170.00', pending: '90.00', updatedAt: '2026-10-16T09:00:00.000Z' });
    renderWithProviders(<BalanceCard variant="finance" />);
    const available = await screen.findByText('Available');
    expect(within(available.closest('div') as HTMLElement).getByText(/170\.00/)).toBeDefined();
    const pending = screen.getByText('Pending');
    expect(within(pending.closest('div') as HTMLElement).getByText(/90\.00/)).toBeDefined();
    expect(
      screen.getByText('Earnings from delivered orders that are still within the 14-day return period.'),
    ).toBeDefined();
    expect(screen.queryByText(/You owe Nile/)).toBeNull();
  });

  it('a negative available balance says what the seller owes (return fees, FI-12)', async () => {
    serveBalance({ available: '-25.00', pending: '0.00', updatedAt: '2026-10-16T09:00:00.000Z' });
    renderWithProviders(<BalanceCard variant="finance" />);
    expect(await screen.findByText(/^You owe Nile .*25\.00 because of return fees\./)).toBeDefined();
  });

  it('load failure: error state', async () => {
    server.use(
      mockApi('get', '/seller/finance/balance', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<BalanceCard variant="finance" />);
    expect(await screen.findByText("Your balance couldn't be loaded.")).toBeDefined();
  });
});

describe('finance page (spec 02 SE-16)', { timeout: 15_000 }, () => {
  it('statement (default tab): descriptions, signed amounts, balance after; newest first', async () => {
    serveBalance({ pending: '0.00', available: '170.00', updatedAt: '2026-10-16T09:00:00.000Z' });
    const queries = serveEntries([
      entry({
        id: fixtureId(8102),
        direction: 'debit',
        amount: '100.00',
        balanceAfter: '170.00',
        entryType: 'seller_payout',
        referenceType: 'payout',
        referenceId: fixtureId(8200),
      }),
      entry({}),
    ]);
    renderWithProviders(<FinanceView tab={null} />);
    const table = await screen.findByRole('table', { name: 'Your statement' });
    const earning = await within(table).findByRole('link', { name: 'Earnings from order' });
    expect(earning.getAttribute('href')).toBe(`/orders/${fixtureId(7001)}`);
    expect(within(table).getByRole('link', { name: 'Payout' }).getAttribute('href')).toBe(
      '/finance?tab=payouts',
    );
    expect(within(table).getByText(/^\+/)).toBeDefined();
    expect(within(table).getByText(/^−/)).toBeDefined();
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({ limit: '20', sort: '-createdAt' });
    expect(screen.getByRole('link', { name: 'Statement' }).getAttribute('aria-current')).toBe('page');
  });

  it('an entry type a seller account never has: shown raw and reported (type and id only)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    serveBalance({ pending: '0.00', available: '0.00', updatedAt: null });
    serveEntries([entry({ id: fixtureId(8300), entryType: 'commission_earned' })]);
    renderWithProviders(<FinanceView tab="statement" />);
    expect(await screen.findByText('commission_earned')).toBeDefined();
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'Unexpected ledger entry types on a seller statement',
        `commission_earned:${fixtureId(8300)}`,
      );
    });
  });

  it('release 2 entries are described, not reported', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    serveBalance({ available: '50.00', pending: '0.00', updatedAt: '2026-10-16T09:00:00.000Z' });
    serveEntries([
      entry({ id: fixtureId(8401), entryType: 'seller_net_released', referenceType: 'seller_order_hold' }),
      entry({
        id: fixtureId(8402),
        entryType: 'seller_net_reversed',
        referenceType: 'return',
        direction: 'debit',
      }),
      entry({
        id: fixtureId(8403),
        entryType: 'return_fee_charged',
        referenceType: 'return',
        direction: 'debit',
      }),
    ]);
    renderWithProviders(<FinanceView tab="statement" />);
    const table = await screen.findByRole('table', { name: 'Your statement' });
    expect(await within(table).findByText('Earnings released')).toBeDefined();
    // Entries about a return link to it (SE-19, T-L3); the released hold has no page of its own.
    expect(within(table).queryByRole('link', { name: 'Earnings released' })).toBeNull();
    expect(within(table).getByRole('link', { name: 'Returned items' }).getAttribute('href')).toBe(
      `/returns/${fixtureId(7001)}`,
    );
    expect(within(table).getByRole('link', { name: 'Return delivery fee' })).toBeDefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('empty statement', async () => {
    serveBalance({ pending: '0.00', available: '0.00', updatedAt: null });
    serveEntries([]);
    renderWithProviders(<FinanceView tab={null} />);
    expect(await screen.findByText('No transactions yet.')).toBeDefined();
    expect(screen.getByText('No earnings yet.')).toBeDefined();
  });

  it('payouts tab: paid date, amount, reference, recorded date', async () => {
    serveBalance({ pending: '0.00', available: '170.00', updatedAt: '2026-10-16T09:00:00.000Z' });
    servePayouts([
      {
        id: fixtureId(8200),
        payeeType: 'seller',
        payeeId: fixtureId(1),
        amount: '100.00',
        externalReference: 'BANK-2026-001',
        recordedByUserId: fixtureId(2),
        paidAt: '2026-10-16T08:00:00.000Z',
        createdAt: '2026-10-16T09:00:00.000Z',
      },
    ]);
    renderWithProviders(<FinanceView tab="payouts" />);
    const table = await screen.findByRole('table', { name: 'Your payouts' });
    expect(await within(table).findByText('BANK-2026-001')).toBeDefined();
    expect(within(table).getByText(/100\.00/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Payouts' }).getAttribute('aria-current')).toBe('page');
  });

  it('on hold tab: order link, amount, release date, waiting for a return; next release first', async () => {
    serveBalance({ pending: '270.00', available: '0.00', updatedAt: '2026-10-16T09:00:00.000Z' });
    const queries = serveHolds([
      {
        sellerOrderId: fixtureId(7001),
        orderNumber: 'NM-41',
        heldAmount: '270.00',
        releaseAfter: '2026-10-30T10:00:00.000Z',
        blockedByReturn: false,
      },
      {
        sellerOrderId: fixtureId(7002),
        orderNumber: 'NM-42',
        heldAmount: '90.00',
        releaseAfter: '2026-10-20T10:00:00.000Z',
        blockedByReturn: true,
      },
    ]);
    renderWithProviders(<FinanceView tab="on-hold" />);
    const table = await screen.findByRole('table', { name: 'Earnings on hold' });
    const first = (await within(table).findByRole('link', { name: 'NM-41' })).closest('tr') as HTMLElement;
    expect(within(table).getByRole('link', { name: 'NM-41' }).getAttribute('href')).toBe(
      `/orders/${fixtureId(7001)}`,
    );
    expect(within(first).getByText(/270\.00/)).toBeDefined();
    expect(within(first).getByText(/^Released on /)).toBeDefined();
    expect(within(first).queryByText('Waiting for an open return')).toBeNull();
    const second = within(table).getByRole('link', { name: 'NM-42' }).closest('tr') as HTMLElement;
    expect(within(second).getByText('Waiting for an open return')).toBeDefined();
    expect(screen.getByRole('link', { name: 'On hold' }).getAttribute('aria-current')).toBe('page');
    expect(queries[0]?.get('sort')).toBe('releaseAfter');
    expect(queries[0]?.get('limit')).toBe('20');
  });

  it('on hold: empty, and a failure with its own message', async () => {
    serveBalance({ pending: '0.00', available: '0.00', updatedAt: null });
    serveHolds([]);
    const view = renderWithProviders(<FinanceView tab="on-hold" />);
    expect(await screen.findByText('Nothing on hold.')).toBeDefined();
    view.unmount();
    serveHolds('error');
    renderWithProviders(<FinanceView tab="on-hold" />);
    expect(await screen.findByText("Your earnings on hold couldn't be loaded.")).toBeDefined();
  });

  it('empty payouts; failures show their own error', async () => {
    serveBalance({ pending: '0.00', available: '0.00', updatedAt: null });
    servePayouts([]);
    const view = renderWithProviders(<FinanceView tab="payouts" />);
    expect(await screen.findByText('No payouts yet.')).toBeDefined();
    view.unmount();
    server.use(
      mockApi('get', '/seller/finance/entries', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<FinanceView tab="statement" />);
    expect(await screen.findByText("Your statement couldn't be loaded.")).toBeDefined();
  });
});
