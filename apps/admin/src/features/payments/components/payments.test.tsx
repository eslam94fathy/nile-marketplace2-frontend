// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { adminListItemFactory, adminPaymentFactory, mockApi, refundFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
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

const renderQueue = (params = {}) =>
  renderWithProviders(
    <>
      <RefundQueue params={params} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

describe('refunds (spec 03 AD-16, T-M8)', { timeout: 15_000 }, () => {
  it('opens on Needs action, oldest first; rows show amount (→ AD-34), reason, method, status and order', async () => {
    const queries = serveRefunds(() => [REFUND]);
    renderQueue();
    const table = await screen.findByRole('table', { name: 'Refunds' });
    expect(queries[0]).toEqual({ limit: '20', sort: 'createdAt', 'status[eq]': 'pending_manual' });
    expect(within(table).getByText('Seller order cancelled')).toBeDefined();
    expect(within(table).getByText('Manual')).toBeDefined();
    expect(
      within(table)
        .getByRole('link', { name: /^EGP\s?100\.00$/ })
        .getAttribute('href'),
    ).toBe(`/refunds/${REFUND.id}`);
    expect(
      within(table)
        .getByRole('link', { name: /^Order / })
        .getAttribute('href'),
    ).toBe(`/orders/${REFUND.orderId}`);
    // Recording happens on AD-34 now.
    expect(within(table).queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', { name: 'Needs action' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Refunded automatically' }).getAttribute('href')).toBe(
      '/refunds?status=succeeded',
    );
  });

  it('a reason box adds it to the URL', async () => {
    const user = userEvent.setup();
    serveRefunds(() => []);
    renderQueue();
    expect(await screen.findByText('Nothing needs action.')).toBeDefined();
    await user.click(screen.getByRole('checkbox', { name: 'Return' }));
    expect(router.push).toHaveBeenCalledWith('/refunds?reason=return');
  });

  it('recorded and automatic rows say when and by whom; a failed automatic one shows its last error', async () => {
    const queries = serveRefunds(() => [
      {
        ...REFUND,
        status: 'recorded',
        providerRefundRef: 'KSH-R-9',
        recordedByUserId: OPS.id,
        recordedAt: '2026-10-15T13:00:00.000Z',
      },
      refundFactory({
        method: 'kashier_auto',
        status: 'succeeded',
        attemptCount: 2,
        succeededAt: '2026-10-15T14:00:00.000Z',
      }),
      refundFactory({
        method: 'kashier_auto',
        status: 'pending_manual',
        attemptCount: 5,
        lastError: 'Kashier answered 422',
      }),
    ]);
    renderQueue({ status: 'all' });
    const table = await screen.findByRole('table', { name: 'Refunds' });
    expect(queries[0]).toEqual({ limit: '20', sort: '-createdAt' });
    expect(await within(table).findByText(/by ops@example\.test$/)).toBeDefined();
    expect(within(table).getByText('Refunded automatically')).toBeDefined();
    expect(within(table).getByText('Kashier answered 422')).toBeDefined();
    expect(within(table).getAllByText('Automatic (Kashier)')).toHaveLength(2);
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
    expect(
      within(refunds)
        .getByRole('link', { name: /^EGP\s?100\.00$/ })
        .getAttribute('href'),
    ).toBe(`/refunds/${REFUND.id}`);
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
