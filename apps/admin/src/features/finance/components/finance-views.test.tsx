// @vitest-environment jsdom
import { financeAccountFactory, fixtureId, ledgerEntryFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { AccountsList } from './accounts-list';
import { ReferenceLookup } from './reference-lookup';
import { Statement } from './statement';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

const PAGE = { nextCursor: null, hasMore: false, limit: 20 };
const SELLER_ACCOUNT = financeAccountFactory();
const COD = financeAccountFactory({
  accountType: 'agent_cod_cash',
  ownerId: fixtureId(10001),
  ownerName: 'Sam Nabil',
  balance: '300.00',
});
const PLATFORM = financeAccountFactory({
  accountType: 'platform_delivery_revenue',
  ownerId: null,
  ownerName: null,
  balance: '-15.00',
});

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
});

function serveAccounts(rows = [SELLER_ACCOUNT, COD, PLATFORM]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/finance/accounts',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

describe('finance accounts (spec 03 AD-18)', { timeout: 15_000 }, () => {
  it('opens on Sellers by balance; owners, Nile, red negatives, statement and money links', async () => {
    const queries = serveAccounts();
    renderWithProviders(<AccountsList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Finance accounts' });
    expect(queries[0]).toEqual({ limit: '20', sort: '-balance', 'accountType[eq]': 'seller_payable' });
    expect(screen.getByText('Nile owes the seller.')).toBeDefined();
    const sellerRow = within(table).getByText('Nile Crafts').closest('tr');
    expect(sellerRow).not.toBeNull();
    expect(
      within(sellerRow as HTMLElement)
        .getByRole('link', { name: 'Record payout' })
        .getAttribute('href'),
    ).toBe(`/finance/payouts?payeeType=seller&payeeId=${SELLER_ACCOUNT.ownerId ?? ''}`);
    expect(within(table).getByRole('link', { name: 'Statement of Nile Crafts' }).getAttribute('href')).toBe(
      `/finance/accounts/${SELLER_ACCOUNT.id}`,
    );
    expect(within(table).getByRole('link', { name: 'Record cash received' }).getAttribute('href')).toBe(
      `/finance/remittances?agent=${COD.ownerId ?? ''}`,
    );
    expect(within(table).getByText('Nile')).toBeDefined();
    const negative = within(table).getByText(/-\s?EGP\s?15\.00|EGP\s?-15\.00/);
    expect(negative.className).toContain('text-destructive');
  });

  it('the AD-05 link filters by owner, with a way back; non-zero toggles in the URL', async () => {
    const user = userEvent.setup();
    const queries = serveAccounts([]);
    renderWithProviders(<AccountsList params={{ owner: fixtureId(9601), type: 'seller_payable' }} />);
    expect(await screen.findByText('No accounts match these filters.')).toBeDefined();
    expect(queries[0]).toMatchObject({ 'ownerId[eq]': fixtureId(9601) });
    expect(screen.getByRole('link', { name: 'Show all owners' }).getAttribute('href')).toBe(
      '/finance/accounts',
    );
    await user.click(screen.getByRole('checkbox', { name: 'Only non-zero balances' }));
    expect(router.replace).toHaveBeenCalledWith(`/finance/accounts?nonzero=1&owner=${fixtureId(9601)}`);
  });
});

describe('account statement (spec 03 AD-19)', { timeout: 15_000 }, () => {
  it('the account, its entries with signs and reference links', async () => {
    const payout = ledgerEntryFactory({
      direction: 'debit',
      amount: '1000.00',
      balanceAfter: '250.00',
      entryType: 'seller_payout',
      referenceType: 'payout',
      referenceId: fixtureId(17501),
    });
    const queries: Record<string, string>[] = [];
    server.use(
      mockApi('get', '/admin/finance/accounts/{accountId}', ({ reply }) => reply.ok(SELLER_ACCOUNT), {
        base: BFF_BASE,
      }),
      mockApi(
        'get',
        '/admin/finance/accounts/{accountId}/entries',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([payout, ledgerEntryFactory()], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<Statement accountId={SELLER_ACCOUNT.id} params={{ type: 'seller_payout' }} />);
    expect(
      await screen.findByRole(
        'heading',
        { level: 1, name: 'Seller balance: Nile Crafts' },
        { timeout: 5000 },
      ),
    ).toBeDefined();
    const table = await screen.findByRole('table', { name: 'Ledger entries, newest first' });
    expect(queries[0]).toEqual({ limit: '20', sort: '-createdAt', 'entryType[eq]': 'seller_payout' });
    expect(within(table).getByText(/^−EGP\s?1,000\.00$/)).toBeDefined();
    expect(within(table).getByText(/^\+EGP\s?225\.00$/)).toBeDefined();
    expect(
      within(table)
        .getByRole('link', { name: /^Payout / })
        .getAttribute('href'),
    ).toBe(`/finance/payouts?payeeType=seller&payeeId=${SELLER_ACCOUNT.ownerId ?? ''}`);
    expect(
      within(table)
        .getByRole('link', { name: /^Seller order / })
        .getAttribute('href'),
    ).toBe(`/finance/lookup?referenceType=seller_order&referenceId=${fixtureId(14501)}`);
    expect(screen.getByRole('checkbox', { name: 'Seller payout' }).getAttribute('data-state')).toBe(
      'checked',
    );
  });

  it('an unknown account is "not found"', async () => {
    server.use(
      mockApi(
        'get',
        '/admin/finance/accounts/{accountId}',
        ({ reply }) => reply.error(404, 'ACCOUNT_NOT_FOUND'),
        {
          base: BFF_BASE,
        },
      ),
    );
    renderWithProviders(<Statement accountId={SELLER_ACCOUNT.id} params={{}} />);
    expect(await screen.findByText("This account doesn't exist.", {}, { timeout: 5000 })).toBeDefined();
  });
});

describe('reference lookup (spec 03 AD-22)', { timeout: 15_000 }, () => {
  it('the form puts the reference in the URL; an invalid id stays in the form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ReferenceLookup params={{}} />);
    expect(screen.getByText('Choose a reference type and paste its id.')).toBeDefined();
    await user.type(screen.getByLabelText(/^Reference id/), 'not-an-id');
    await user.click(screen.getByRole('button', { name: 'Find entries' }));
    expect(await screen.findByText('Enter the full id (a UUID).')).toBeDefined();
    expect(router.push).not.toHaveBeenCalled();
    const input = screen.getByLabelText(/^Reference id/);
    await user.clear(input);
    await user.type(input, ` ${fixtureId(14501)} `);
    await user.click(screen.getByRole('button', { name: 'Find entries' }));
    expect(router.push).toHaveBeenCalledWith(
      `/finance/lookup?referenceType=seller_order&referenceId=${fixtureId(14501)}`,
    );
  });

  it('entries name their account; none yet explains why', async () => {
    const entry = { ...ledgerEntryFactory(), accountId: SELLER_ACCOUNT.id };
    server.use(
      mockApi('get', '/admin/finance/entries', ({ reply }) => reply.ok([entry]), { base: BFF_BASE }),
      mockApi('get', '/admin/finance/accounts/{accountId}', ({ reply }) => reply.ok(SELLER_ACCOUNT), {
        base: BFF_BASE,
      }),
    );
    const view = renderWithProviders(
      <ReferenceLookup params={{ referenceType: 'seller_order', referenceId: fixtureId(14501) }} />,
    );
    const table = await screen.findByRole('table', { name: 'Ledger entries for this reference' });
    expect(
      (await within(table).findByRole('link', { name: 'Seller balance: Nile Crafts' })).getAttribute('href'),
    ).toBe(`/finance/accounts/${SELLER_ACCOUNT.id}`);
    expect(within(table).getByText('Credit')).toBeDefined();
    view.unmount();

    server.use(mockApi('get', '/admin/finance/entries', ({ reply }) => reply.ok([]), { base: BFF_BASE }));
    renderWithProviders(
      <ReferenceLookup params={{ referenceType: 'order', referenceId: fixtureId(14001) }} />,
    );
    expect(await screen.findByText('No ledger entries for this reference yet.')).toBeDefined();
  });
});
