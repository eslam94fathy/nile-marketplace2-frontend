// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { adminListItemFactory, adminPaymentFactory, mockApi, refundFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { OrderPaymentSummary, PaymentDetail } from './payment-detail';
import { RefundQueue } from './refund-queue';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Refund = Schema<'RefundDto'>;

const ME = adminListItemFactory({ email: 'me@example.test' });
const OPS = adminListItemFactory({ email: 'ops@example.test' });
const REFUND = refundFactory({ amount: '100.00' });
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  server.use(
    mockApi('get', '/admin/admins', ({ reply }) => reply.ok([ME, OPS], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
  );
});

function serveRefunds(rows: () => Refund[]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/payments/refunds',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(rows(), PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

type Answer = Refund | { readonly status: number; readonly code: ErrorCode };

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

const renderQueue = (params = {}) =>
  renderWithProviders(
    <>
      <RefundQueue params={params} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

describe('refund queue (spec 03 AD-16)', { timeout: 15_000 }, () => {
  it('opens on To record, oldest first; rows show amount, reason and order link', async () => {
    const queries = serveRefunds(() => [REFUND]);
    renderQueue();
    const table = await screen.findByRole('table', { name: 'Refunds' });
    expect(queries[0]).toEqual({ limit: '20', sort: 'createdAt', 'status[eq]': 'pending_manual' });
    expect(within(table).getByText('Seller order cancelled')).toBeDefined();
    expect(
      within(table)
        .getByRole('link', { name: /^Order / })
        .getAttribute('href'),
    ).toBe(`/orders/${REFUND.orderId}`);
    expect(screen.getByRole('link', { name: 'To record' }).getAttribute('aria-current')).toBe('page');
  });

  it('a reason box adds it to the URL', async () => {
    const user = userEvent.setup();
    serveRefunds(() => []);
    renderQueue();
    expect(await screen.findByText('Nothing to record.')).toBeDefined();
    await user.click(screen.getByRole('checkbox', { name: 'Delivery failed (returned)' }));
    expect(router.push).toHaveBeenCalledWith('/refunds?reason=delivery_failed');
  });

  it('recorded rows show the reference and who recorded it', async () => {
    serveRefunds(() => [
      {
        ...REFUND,
        status: 'recorded',
        providerRefundRef: 'KSH-R-9',
        recordedByUserId: OPS.id,
        recordedAt: '2026-10-15T13:00:00.000Z',
      },
    ]);
    renderQueue({ status: 'recorded' });
    const table = await screen.findByRole('table', { name: 'Refunds' });
    expect(within(table).getByText('KSH-R-9')).toBeDefined();
    expect(await within(table).findByText(/by ops@example\.test$/)).toBeDefined();
    expect(within(table).queryByRole('button', { name: /^Record refund/ })).toBeNull();
  });

  it('record: the Kashier instruction is shown; a failed try is retried with the same key, never twice', async () => {
    const user = userEvent.setup();
    let recorded = false;
    serveRefunds(() => (recorded ? [] : [REFUND]));
    const calls = serveRecord([
      { status: 500, code: 'INTERNAL_ERROR' },
      { ...REFUND, status: 'recorded', providerRefundRef: 'KSH-R-1' },
    ]);
    renderQueue();
    await user.click(await screen.findByRole('button', { name: /^Record refund of / }));
    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(
        /^Refund EGP\s?100\.00 in the Kashier dashboard first, then enter Kashier's refund reference here\.$/,
      ),
    ).toBeDefined();
    await user.click(within(dialog).getByRole('button', { name: 'Record refund' }));
    expect(calls).toEqual([]);
    await user.type(within(dialog).getByLabelText(/^Kashier's refund reference/), ' KSH-R-1 ');
    await user.click(within(dialog).getByRole('button', { name: 'Record refund' }));
    expect(await within(dialog).findByRole('alert')).toBeDefined();
    recorded = true;
    await user.click(within(dialog).getByRole('button', { name: 'Record refund' }));
    expect(await screen.findByText(/^Refund of EGP\s?100\.00 recorded\.$/)).toBeDefined();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toEqual({ providerRefundRef: 'KSH-R-1' });
    expect(calls[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]?.key).toBe(calls[0]?.key);
    expect(await screen.findByText('Nothing to record.')).toBeDefined();
  });

  it('REFUND_ALREADY_RECORDED closes, reloads and explains', async () => {
    const user = userEvent.setup();
    const queries = serveRefunds(() => [REFUND]);
    serveRecord([{ status: 409, code: 'REFUND_ALREADY_RECORDED' }]);
    renderQueue();
    await user.click(await screen.findByRole('button', { name: /^Record refund of / }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/^Kashier's refund reference/), 'KSH-R-2');
    await user.click(within(dialog).getByRole('button', { name: 'Record refund' }));
    expect(await screen.findByText('This refund was already recorded.')).toBeDefined();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(queries.length).toBeGreaterThan(1);
    });
  });
});

describe('payment (spec 03 AD-17)', { timeout: 15_000 }, () => {
  it('amounts, Kashier references, refunds and events (no payloads)', async () => {
    const payment = adminPaymentFactory({
      refunds: [REFUND],
      events: [
        {
          id: 'e-1',
          eventType: 'payment.succeeded',
          signatureValid: true,
          processedAt: '2026-10-15T10:05:01.000Z',
          createdAt: '2026-10-15T10:05:00.000Z',
        },
        {
          id: 'e-2',
          eventType: 'payment.succeeded',
          signatureValid: false,
          processedAt: null,
          createdAt: '2026-10-15T10:06:00.000Z',
        },
      ],
    });
    server.use(
      mockApi('get', '/admin/payments/{paymentId}', ({ reply }) => reply.ok(payment), { base: BFF_BASE }),
    );
    renderWithProviders(<PaymentDetail paymentId={payment.id} currentUserId={ME.id} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Payment' }, { timeout: 5000 }),
    ).toBeDefined();
    expect(screen.getByText('KSH-TX-1')).toBeDefined();
    const events = screen.getByRole('table', { name: 'Payment events' });
    expect(within(events).getByText('Invalid')).toBeDefined();
    expect(within(events).getByText('Not processed')).toBeDefined();
    const refunds = screen.getByRole('table', { name: 'Refunds of this payment' });
    expect(within(refunds).getByRole('button', { name: /^Record refund of / })).toBeDefined();
  });

  it('an unknown payment is "not found"', async () => {
    server.use(
      mockApi('get', '/admin/payments/{paymentId}', ({ reply }) => reply.error(404, 'PAYMENT_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<PaymentDetail paymentId={REFUND.paymentId} currentUserId={ME.id} />);
    expect(await screen.findByText("This payment doesn't exist.", {}, { timeout: 5000 })).toBeDefined();
  });

  it('order summary: PAYMENT_NOT_FOUND is "No payment record"', async () => {
    server.use(
      mockApi(
        'get',
        '/admin/orders/{orderId}/payment',
        ({ reply }) => reply.error(404, 'PAYMENT_NOT_FOUND'),
        {
          base: BFF_BASE,
        },
      ),
    );
    renderWithProviders(<OrderPaymentSummary orderId={REFUND.orderId} currentUserId={ME.id} />);
    expect(await screen.findByText('No payment record', {}, { timeout: 5000 })).toBeDefined();
  });

  it('order summary links to the payment', async () => {
    const payment = adminPaymentFactory();
    server.use(
      mockApi('get', '/admin/orders/{orderId}/payment', ({ reply }) => reply.ok(payment), { base: BFF_BASE }),
    );
    renderWithProviders(<OrderPaymentSummary orderId={payment.orderId} currentUserId={ME.id} />);
    expect(
      (await screen.findByRole('link', { name: 'Open the payment' }, { timeout: 5000 })).getAttribute('href'),
    ).toBe(`/payments/${payment.id}`);
  });
});
