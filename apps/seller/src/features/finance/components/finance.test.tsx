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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('balance (spec 02 SE-16, SE-06)', () => {
  it('"0.00" with no update yet: no earnings yet (the overview explains when they come)', async () => {
    serveBalance({ balance: '0.00', updatedAt: null });
    renderWithProviders(<BalanceCard variant="overview" />);
    expect(
      await screen.findByText('No earnings yet. Earnings are added when an order is delivered.'),
    ).toBeDefined();
    expect(screen.getByText('Balances update a few moments after a delivery.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'View finance' }).getAttribute('href')).toBe('/finance');
  });

  it('a balance: the amount and when it was last updated; 0.00 after payouts is still a balance', async () => {
    serveBalance({ balance: '0.00', updatedAt: '2026-10-15T12:00:00.000Z' });
    renderWithProviders(<BalanceCard variant="finance" />);
    expect(await screen.findByText(/^Last updated /)).toBeDefined();
    expect(screen.getByText(/0\.00/)).toBeDefined();
    expect(screen.queryByText(/No earnings yet/)).toBeNull();
    expect(screen.getByText(/Nile pays you outside the app and records each payout here\./)).toBeDefined();
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
    serveBalance({ balance: '170.00', updatedAt: '2026-10-16T09:00:00.000Z' });
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
    serveBalance({ balance: '0.00', updatedAt: null });
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

  it('empty statement', async () => {
    serveBalance({ balance: '0.00', updatedAt: null });
    serveEntries([]);
    renderWithProviders(<FinanceView tab={null} />);
    expect(await screen.findByText('No transactions yet.')).toBeDefined();
    expect(screen.getByText('No earnings yet.')).toBeDefined();
  });

  it('payouts tab: paid date, amount, reference, recorded date', async () => {
    serveBalance({ balance: '170.00', updatedAt: '2026-10-16T09:00:00.000Z' });
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

  it('empty payouts; failures show their own error', async () => {
    serveBalance({ balance: '0.00', updatedAt: null });
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
