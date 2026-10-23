// @vitest-environment jsdom
import {
  agentProfileFactory,
  fixtureId,
  ledgerEntryFactory,
  mockApi,
  remittanceFactory,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { FinanceView } from './finance-view';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

const server = setupMswServer();
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

beforeEach(() => {
  server.use(
    mockApi('get', '/agent/profile', ({ reply }) => reply.ok(agentProfileFactory()), { base: BFF_BASE }),
    mockApi(
      'get',
      '/agent/finance/balances',
      ({ reply }) => reply.ok({ feePayable: '45.00', codCashHeld: '300.00' }),
      { base: BFF_BASE },
    ),
  );
});

describe('finance (spec 04 AG-07)', { timeout: 15_000 }, () => {
  it('both balances; Fees by default with signed amounts and the agent wording', async () => {
    const queries: Record<string, string>[] = [];
    server.use(
      mockApi(
        'get',
        '/agent/finance/entries',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok(
            [
              ledgerEntryFactory({ entryType: 'agent_fee_earned', amount: '45.00', balanceAfter: '45.00' }),
              ledgerEntryFactory({
                id: fixtureId(16599),
                entryType: 'agent_payout',
                direction: 'debit',
                amount: '10.00',
              }),
            ],
            PAGE,
          );
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<FinanceView params={{}} />);
    const owed = await screen.findByRole('region', { name: 'Nile owes you' });
    expect(within(owed).getByText(/^EGP\s?45\.00$/)).toBeDefined();
    expect(
      within(screen.getByRole('region', { name: 'Cash to hand in' })).getByText(/^EGP\s?300\.00$/),
    ).toBeDefined();
    expect(await screen.findByText('Fee for delivery')).toBeDefined();
    expect(screen.getByText('Payout')).toBeDefined();
    expect(screen.getByText(/^−EGP\s?10\.00$/)).toBeDefined();
    expect(queries[0]).toEqual({ account: 'fee', limit: '20', sort: '-createdAt' });
  });

  it('Cash uses the cod account; Hand-ins lists remittances', async () => {
    const queries: Record<string, string>[] = [];
    server.use(
      mockApi(
        'get',
        '/agent/finance/entries',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([ledgerEntryFactory({ entryType: 'cod_cash_collected' })], PAGE);
        },
        { base: BFF_BASE },
      ),
      mockApi(
        'get',
        '/agent/finance/remittances',
        ({ reply }) => reply.ok([remittanceFactory({ note: 'Friday' })], PAGE),
        { base: BFF_BASE },
      ),
    );
    const view = renderWithProviders(<FinanceView params={{ tab: 'cash' }} />);
    expect(await screen.findByText('Collected on delivery')).toBeDefined();
    expect(queries[0]).toMatchObject({ account: 'cod' });
    view.unmount();
    renderWithProviders(<FinanceView params={{ tab: 'handins' }} />);
    expect(await screen.findByText('Friday')).toBeDefined();
    expect(screen.getByText('Confirmed by an admin')).toBeDefined();
  });

  it('empty statement', async () => {
    server.use(
      mockApi('get', '/agent/finance/entries', ({ reply }) => reply.ok([], PAGE), { base: BFF_BASE }),
    );
    renderWithProviders(<FinanceView params={{}} />);
    expect(await screen.findByText('No transactions yet.')).toBeDefined();
  });
});
