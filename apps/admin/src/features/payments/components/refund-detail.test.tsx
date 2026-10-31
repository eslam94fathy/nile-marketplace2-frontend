// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import {
  adminListItemFactory,
  adminPaymentFactory,
  fixtureId,
  mockApi,
  refundFactory,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { RefundDetail } from './refund-detail';

const server = setupMswServer();

type Refund = Schema<'RefundDetailDto'>;

const ME = adminListItemFactory({ email: 'me@example.test' });
const KASHIER = adminPaymentFactory({ method: 'kashier' });
const COD = adminPaymentFactory({ method: 'cod' });
const PAGE = { nextCursor: null, hasMore: false, limit: 100 };

/** A Kashier refund the job handed back after its attempts ran out. */
const REFUND: Refund = {
  ...refundFactory({
    paymentId: KASHIER.id,
    amount: '100.00',
    method: 'kashier_auto',
    attemptCount: 5,
    lastError: 'Kashier answered 422',
  }),
  payoutDetails: null,
};

/** A COD return refund paid out by hand to a mobile wallet. */
const COD_REFUND: Refund = {
  ...refundFactory({
    paymentId: COD.id,
    amount: '150.00',
    reason: 'return',
    returnId: fixtureId(21501),
    hasPayoutDetails: true,
  }),
  payoutDetails: { method: 'mobile_wallet', walletNumber: '+201001234567', instapayAddress: null },
};

beforeEach(() => {
  server.use(
    mockApi('get', '/admin/admins', ({ reply }) => reply.ok([ME], PAGE), { base: BFF_BASE }),
    mockApi(
      'get',
      '/admin/payments/{paymentId}',
      ({ params, reply }) => reply.ok(params.paymentId === COD.id ? COD : KASHIER),
      { base: BFF_BASE },
    ),
  );
});

function serveRefund(initial: Refund) {
  const state = { refund: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/payments/refunds/{refundId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.refund);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

type Answer = Schema<'RefundDto'> | { readonly status: number; readonly code: ErrorCode };

function serveRecord(answers: Answer[]) {
  const calls: { key: string | null; body: unknown }[] = [];
  server.use(
    mockApi(
      'post',
      '/admin/payments/refunds/{refundId}/record',
      async ({ request, reply }) => {
        calls.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        const answer = answers[Math.min(calls.length, answers.length) - 1] ?? answers[0];
        if (answer === undefined) throw new Error('no answer');
        return 'code' in answer ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return calls;
}

const renderDetail = (refund: Refund = REFUND) =>
  renderWithProviders(
    <>
      <RefundDetail refundId={refund.id} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

describe('refund (spec 03 AD-34, T-M8)', { timeout: 20_000 }, () => {
  it('a Kashier refund needing action: facts, last error, Record and Retry; no payout details', async () => {
    serveRefund(REFUND);
    renderDetail();
    expect(await screen.findByRole('heading', { level: 1, name: /^Refund of EGP\s?100\.00$/ })).toBeDefined();
    const details = screen.getByLabelText('Refund details');
    expect(within(details).getByText('Automatic (Kashier)')).toBeDefined();
    expect(within(details).getByText('Kashier answered 422')).toBeDefined();
    expect(within(details).getByRole('link', { name: 'Open the payment' }).getAttribute('href')).toBe(
      `/payments/${KASHIER.id}`,
    );
    const actions = screen.getByRole('group', { name: 'Refund actions' });
    expect(await within(actions).findByRole('button', { name: 'Retry automatic refund' })).toBeDefined();
    expect(within(actions).getByRole('button', { name: 'Record refund…' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Pay to' })).toBeNull();
  });

  it('record (Kashier): instruction, reference, summary; a failed try is sent again with the same key', async () => {
    const state = serveRefund(REFUND);
    const calls = serveRecord([
      { status: 500, code: 'INTERNAL_ERROR' },
      { ...REFUND, status: 'recorded', providerRefundRef: 'KSH-R-1' },
    ]);
    const view = renderDetail();
    const record = await screen.findByRole('button', { name: 'Record refund…' });
    await vi.waitFor(() => {
      expect(record.hasAttribute('disabled')).toBe(false);
    });
    await view.user.click(record);
    const dialog = screen.getByRole('dialog', { name: /^Record refund of EGP\s?100\.00$/ });
    expect(
      within(dialog).getByText(
        /^Refund EGP\s?100\.00 in the Kashier dashboard first, then enter Kashier's refund reference\.$/,
      ),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(calls).toEqual([]);
    await view.user.type(within(dialog).getByLabelText(/^Kashier's refund reference/), ' KSH-R-1 ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const confirm = screen.getByRole('dialog', { name: 'Check and confirm' });
    expect(within(confirm).getByText(/with the reference KSH-R-1\? This can't be undone\.$/)).toBeDefined();
    await view.user.click(within(confirm).getByRole('button', { name: 'Record refund' }));
    expect(await within(confirm).findByRole('alert')).toBeDefined();
    state.refund = {
      ...REFUND,
      status: 'recorded',
      providerRefundRef: 'KSH-R-1',
      recordedByUserId: ME.id,
      recordedAt: '2026-10-31T10:00:00.000Z',
    };
    await view.user.click(within(confirm).getByRole('button', { name: 'Record refund' }));
    expect(await screen.findByText(/^Refund of EGP\s?100\.00 recorded\.$/)).toBeDefined();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toEqual({ providerRefundRef: 'KSH-R-1' });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]?.key).toBe(calls[0]?.key);
    expect(await screen.findByText(/by you$/)).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Refund actions' })).toBeNull();
  });

  it('a COD return refund: "Pay to" with a Copy button, the transfer wording, the return link, no Retry', async () => {
    serveRefund(COD_REFUND);
    const view = renderDetail(COD_REFUND);
    expect(await screen.findByRole('heading', { level: 2, name: 'Pay to' })).toBeDefined();
    expect(screen.getByText('Mobile wallet +201001234567')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Copy the payout details' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Open the return' }).getAttribute('href')).toBe(
      `/returns/${fixtureId(21501)}`,
    );
    const record = await screen.findByRole('button', { name: 'Record refund…' });
    await vi.waitFor(() => {
      expect(record.hasAttribute('disabled')).toBe(false);
    });
    expect(screen.queryByRole('button', { name: 'Retry automatic refund' })).toBeNull();
    await view.user.click(record);
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByText(
        /^Send EGP\s?150\.00 to the customer's Mobile wallet first, then enter the transfer reference\.$/,
      ),
    ).toBeDefined();
    expect(within(dialog).getByLabelText(/^Transfer reference/)).toBeDefined();
  });

  it('retry: confirmed, then scheduled again', async () => {
    const state = serveRefund(REFUND);
    server.use(
      mockApi(
        'post',
        '/admin/payments/refunds/{refundId}/retry',
        ({ reply }) => {
          state.refund = { ...REFUND, status: 'pending_auto', attemptCount: 0, lastError: null };
          return reply.ok(state.refund);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Retry automatic refund' }));
    const dialog = screen.getByRole('dialog', { name: 'Retry automatic refund' });
    expect(
      within(dialog).getByText(
        'Send this refund to Kashier again? Do this only after fixing the cause shown above.',
      ),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Retry automatic refund' }));
    expect(await screen.findByText('The refund is scheduled again.')).toBeDefined();
    expect(await screen.findByText('Automatic, scheduled')).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Refund actions' })).toBeNull();
  });

  it('REFUND_NOT_RETRYABLE: "Record it by hand", the refund is read again', async () => {
    const state = serveRefund(REFUND);
    server.use(
      mockApi(
        'post',
        '/admin/payments/refunds/{refundId}/retry',
        ({ reply }) => reply.error(409, 'REFUND_NOT_RETRYABLE'),
        {
          base: BFF_BASE,
        },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Retry automatic refund' }));
    const reads = state.reads;
    await view.user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Retry automatic refund' }),
    );
    expect(
      await screen.findByText("This refund can't be retried automatically. Record it by hand."),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(state.reads).toBeGreaterThan(reads);
    });
  });

  it('an unknown refund is "not found"', async () => {
    server.use(
      mockApi(
        'get',
        '/admin/payments/refunds/{refundId}',
        ({ reply }) => reply.error(404, 'REFUND_NOT_FOUND'),
        {
          base: BFF_BASE,
        },
      ),
    );
    renderDetail();
    expect(await screen.findByText("This refund doesn't exist.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to refunds' }).getAttribute('href')).toBe('/refunds');
  });
});
