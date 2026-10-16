// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import {
  adminAgentFactory,
  adminListItemFactory,
  adminSellerDetailFactory,
  financeAccountFactory,
  fixtureId,
  mockApi,
  payoutFactory,
  remittanceFactory,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { Payouts } from './payouts';
import { Remittances } from './remittances';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

const PAGE = { nextCursor: null, hasMore: false, limit: 20 };
const ME = adminListItemFactory({ email: 'me@example.test' });
const SAM = adminAgentFactory({ id: fixtureId(10001), fullName: 'Sam Nabil' });
const SHOP = adminSellerDetailFactory({ id: fixtureId(9601), businessName: 'Nile Crafts' });

/** The owner's account balance the dialogs read; changed by tests to simulate a fresh read. */
const balances = { cod: '300.00', owed: '1250.00' };

beforeEach(() => {
  balances.cod = '300.00';
  balances.owed = '1250.00';
  router.push.mockReset();
  router.replace.mockReset();
  server.use(
    mockApi('get', '/admin/admins', ({ reply }) => reply.ok([ME], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
    mockApi('get', '/admin/delivery-agents', ({ reply }) => reply.ok([SAM], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
    mockApi('get', '/admin/delivery-agents/{agentId}', ({ reply }) => reply.ok(SAM), { base: BFF_BASE }),
    mockApi('get', '/admin/sellers/{sellerId}', ({ reply }) => reply.ok(SHOP), { base: BFF_BASE }),
    mockApi('get', '/admin/sellers', ({ reply }) => reply.ok([{ ...SHOP }], { ...PAGE, limit: 10 }), {
      base: BFF_BASE,
    }),
    mockApi(
      'get',
      '/admin/finance/accounts',
      ({ request, reply }) => {
        const type = new URL(request.url).searchParams.get('accountType[eq]');
        const account =
          type === 'agent_cod_cash'
            ? financeAccountFactory({ accountType: 'agent_cod_cash', ownerId: SAM.id, balance: balances.cod })
            : financeAccountFactory({ ownerId: SHOP.id, balance: balances.owed });
        return reply.ok([account], { ...PAGE, limit: 10 });
      },
      { base: BFF_BASE },
    ),
    mockApi('get', '/admin/finance/cod-remittances', ({ reply }) => reply.ok([remittanceFactory()], PAGE), {
      base: BFF_BASE,
    }),
    mockApi('get', '/admin/finance/payouts', ({ reply }) => reply.ok([payoutFactory()], PAGE), {
      base: BFF_BASE,
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

interface Failure {
  readonly status: number;
  readonly code: ErrorCode;
}
type RemittanceAnswer = Schema<'RemittanceDto'> | Failure;
type PayoutAnswer = Schema<'PayoutDto'> | Failure;
const isFailure = (answer: object): answer is Failure => 'code' in answer && 'status' in answer;

/** Records each call (key and body); answers in order, the last one repeated. */
function recorder<A>(answers: A[]) {
  const calls: { key: string | null; body: unknown }[] = [];
  const next = async (request: Request): Promise<A> => {
    calls.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
    const answer = answers[Math.min(calls.length, answers.length) - 1];
    if (answer === undefined) throw new Error('no answer');
    return answer;
  };
  return { calls, next };
}

function serveRemittance(answers: RemittanceAnswer[]) {
  const { calls, next } = recorder(answers);
  server.use(
    mockApi(
      'post',
      '/admin/finance/cod-remittances',
      async ({ request, reply }) => {
        const answer = await next(request);
        return isFailure(answer) ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return calls;
}

function servePayout(answers: PayoutAnswer[]) {
  const { calls, next } = recorder(answers);
  server.use(
    mockApi(
      'post',
      '/admin/finance/payouts',
      async ({ request, reply }) => {
        const answer = await next(request);
        return isFailure(answer) ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return calls;
}

const render = (ui: React.ReactNode) =>
  renderWithProviders(
    <>
      {ui}
      <Toaster />
    </>,
  );

describe('COD remittances (spec 03 AD-20)', { timeout: 20_000 }, () => {
  it('the list names agents and admins', async () => {
    server.use(
      mockApi(
        'get',
        '/admin/finance/cod-remittances',
        ({ reply }) => reply.ok([remittanceFactory({ confirmedByUserId: ME.id })], PAGE),
        { base: BFF_BASE },
      ),
    );
    render(<Remittances params={{}} currentUserId={ME.id} />);
    const table = await screen.findByRole('table', { name: 'COD remittances, newest first' });
    expect(await within(table).findByRole('link', { name: 'Sam Nabil' })).toBeDefined();
    expect(await within(table).findByText('you')).toBeDefined();
  });

  it('prefilled agent, cash shown, warning above it, summary, note omitted, same key on retry', async () => {
    const user = userEvent.setup();
    const calls = serveRemittance([
      { status: 500, code: 'INTERNAL_ERROR' },
      remittanceFactory({ amount: '200.00' }),
    ]);
    render(<Remittances params={{ agent: SAM.id }} currentUserId={ME.id} />);
    await user.click(await screen.findByRole('button', { name: 'Record cash received' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record cash received' });
    expect(await within(dialog).findByText(/^Holds EGP\s?300\.00 in COD cash\.$/)).toBeDefined();
    const amount = within(dialog).getByLabelText(/^Amount/);
    await user.type(amount, '350');
    expect(within(dialog).getByText('This is more than the agent holds; it will be refused.')).toBeDefined();
    await user.clear(amount);
    await user.type(amount, '200');
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const confirm = await screen.findByRole('dialog', { name: 'Confirm cash received' });
    expect(
      within(confirm).getByText(
        /^Record EGP\s?200\.00 received from Sam Nabil\? Their COD cash goes down by this amount\.$/,
      ),
    ).toBeDefined();
    expect(calls).toEqual([]);
    await user.click(within(confirm).getByRole('button', { name: 'Record cash received' }));
    expect(await within(confirm).findByRole('alert')).toBeDefined();
    await user.click(within(confirm).getByRole('button', { name: 'Record cash received' }));
    expect(await screen.findByText(/received from Sam Nabil recorded\.$/)).toBeDefined();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toEqual({ agentId: SAM.id, amount: '200' });
    expect(calls[1]?.key).toBe(calls[0]?.key);
  });

  it('REMITTANCE_EXCEEDS_BALANCE reads the balance again and shows it', async () => {
    const user = userEvent.setup();
    serveRemittance([{ status: 422, code: 'REMITTANCE_EXCEEDS_BALANCE' }]);
    render(<Remittances params={{ agent: SAM.id }} currentUserId={ME.id} />);
    await user.click(await screen.findByRole('button', { name: 'Record cash received' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(/^Holds /);
    await user.type(within(dialog).getByLabelText(/^Amount/), '250');
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    balances.cod = '100.00';
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Record cash received' }),
    );
    expect(await screen.findByText(/^The agent holds only EGP\s?100\.00\.$/)).toBeDefined();
    expect(screen.getByRole('dialog', { name: 'Record cash received' })).toBeDefined();
  });
});

describe('payouts (spec 03 AD-21)', { timeout: 20_000 }, () => {
  const choosePayee = async (user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) => {
    await user.type(within(dialog).getByLabelText(/^Payee(?! type)/), 'Nile');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Choose Nile Crafts' }, { timeout: 3000 }),
    );
    expect(await within(dialog).findByText(/^Nile owes EGP\s?1,250\.00\.$/)).toBeDefined();
  };

  it('the list names payees', async () => {
    render(<Payouts params={{}} currentUserId={ME.id} />);
    const table = await screen.findByRole('table', { name: 'Payouts, newest first' });
    expect(await within(table).findByRole('link', { name: 'Nile Crafts' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('aria-current')).toBe('page');
  });

  it('search and choose a payee; reference and paid-at sent as ISO; the summary first', async () => {
    const user = userEvent.setup();
    const calls = servePayout([payoutFactory({ amount: '500.00' })]);
    render(<Payouts params={{}} currentUserId={ME.id} />);
    await user.click(await screen.findByRole('button', { name: 'Record payout' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payout' });
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(await within(dialog).findByText('Choose a payee.')).toBeDefined();
    await choosePayee(user, dialog);
    await user.type(within(dialog).getByLabelText(/^Amount/), '500');
    await user.type(within(dialog).getByLabelText(/^External reference/), ' TRX-77 ');
    const paidAt = within(dialog).getByLabelText(/^Paid at/);
    await user.clear(paidAt);
    await user.type(paidAt, '2026-01-15T10:30');
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const confirm = await screen.findByRole('dialog', { name: 'Confirm payout' });
    expect(
      within(confirm).getByText(/to Seller: Nile Crafts, reference TRX-77, paid 15 Jan 2026, 10:30\?$/),
    ).toBeDefined();
    await user.click(within(confirm).getByRole('button', { name: 'Record payout' }));
    expect(await screen.findByText(/^Payout of EGP\s?500\.00 to Nile Crafts recorded\.$/)).toBeDefined();
    expect(calls[0]?.body).toEqual({
      payeeType: 'seller',
      payeeId: SHOP.id,
      amount: '500',
      externalReference: 'TRX-77',
      paidAt: '2026-01-15T08:30:00.000Z',
    });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('a paid-at in the future is refused before sending', async () => {
    const user = userEvent.setup();
    const calls = servePayout([payoutFactory()]);
    render(<Payouts params={{ payeeType: 'seller', payeeId: SHOP.id }} currentUserId={ME.id} />);
    await user.click(await screen.findByRole('button', { name: 'Record payout' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payout' });
    expect(await within(dialog).findByText(/^Nile owes /)).toBeDefined();
    await user.type(within(dialog).getByLabelText(/^Amount/), '10');
    await user.type(within(dialog).getByLabelText(/^External reference/), 'TRX-1');
    const paidAt = within(dialog).getByLabelText(/^Paid at/);
    await user.clear(paidAt);
    await user.type(paidAt, '2099-01-01T10:00');
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(await within(dialog).findByText("The payment can't be in the future.")).toBeDefined();
    expect(calls).toEqual([]);
  });

  it('PAYOUT_ALREADY_RECORDED goes on the reference; PAYOUT_EXCEEDS_BALANCE shows the fresh balance', async () => {
    const user = userEvent.setup();
    servePayout([
      { status: 409, code: 'PAYOUT_ALREADY_RECORDED' },
      { status: 422, code: 'PAYOUT_EXCEEDS_BALANCE' },
    ]);
    render(<Payouts params={{ payeeType: 'seller', payeeId: SHOP.id }} currentUserId={ME.id} />);
    await user.click(await screen.findByRole('button', { name: 'Record payout' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record payout' });
    await within(dialog).findByText(/^Nile owes /);
    await user.type(within(dialog).getByLabelText(/^Amount/), '900');
    await user.type(within(dialog).getByLabelText(/^External reference/), 'TRX-1');
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Record payout' }),
    );
    expect(
      await screen.findByText('A payout with this reference is already recorded for this payee.'),
    ).toBeDefined();
    const form = screen.getByRole('dialog', { name: 'Record payout' });
    const reference = within(form).getByLabelText(/^External reference/);
    await user.clear(reference);
    await user.type(reference, 'TRX-2');
    await user.click(within(form).getByRole('button', { name: 'Continue' }));
    balances.owed = '800.00';
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Record payout' }),
    );
    expect(await screen.findByText(/^Nile owes this payee only EGP\s?800\.00\.$/)).toBeDefined();
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Record payout' })).toBeDefined();
    });
  });
});
