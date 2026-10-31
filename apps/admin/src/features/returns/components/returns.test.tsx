// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import {
  adminCustomerDetailFactory,
  adminListItemFactory,
  adminReturnFactory,
  adminSellerDetailFactory,
  adminShipmentFactory,
  mockApi,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { ReturnDetail } from './return-detail';
import { ReturnsList } from './returns-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Return = Schema<'AdminReturnDto'>;

const ME = adminListItemFactory({ email: 'me@example.test' });
const SELLER = adminSellerDetailFactory({ businessName: 'Nile Crafts' });
const CUSTOMER = adminCustomerDetailFactory({ firstName: 'Mona', lastName: 'Ali' });
const RETURN = adminReturnFactory({ sellerId: SELLER.id, customerId: CUSTOMER.id });
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

beforeEach(() => {
  router.push.mockReset();
  server.use(
    mockApi('get', '/admin/sellers/{sellerId}', ({ reply }) => reply.ok(SELLER), { base: BFF_BASE }),
    mockApi('get', '/admin/customers/{customerId}', ({ reply }) => reply.ok(CUSTOMER), { base: BFF_BASE }),
    mockApi('get', '/admin/admins', ({ reply }) => reply.ok([ME], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
    mockApi('get', '/admin/shipments', ({ reply }) => reply.ok([], { ...PAGE, limit: 50 }), {
      base: BFF_BASE,
    }),
  );
});

function serveList(rows: Return[]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/returns',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

function serveReturn(initial: Return) {
  const state = { item: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/returns/{returnId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.item);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

const renderDetail = (item: Return = RETURN) =>
  renderWithProviders(
    <>
      <ReturnDetail returnId={item.id} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

describe('returns (spec 03 AD-32, T-M7)', { timeout: 15_000 }, () => {
  it('opens on "Needs decision", newest first; rows link the return, order and seller', async () => {
    const waiting = adminReturnFactory({
      sellerId: SELLER.id,
      status: 'requested',
      sellerDecisionDeadlineAt: '2026-11-02T10:00:00.000Z',
    });
    const queries = serveList([RETURN, waiting]);
    renderWithProviders(<ReturnsList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Returns, newest first' });
    expect(within(table).getByRole('link', { name: RETURN.returnNumber }).getAttribute('href')).toBe(
      `/returns/${RETURN.id}`,
    );
    expect(
      within(table)
        .getByRole('link', { name: `Order ${RETURN.orderNumber}` })
        .getAttribute('href'),
    ).toBe(`/orders/${RETURN.orderId}`);
    expect(
      (await within(table).findAllByRole('link', { name: 'Nile Crafts' }))[0]?.getAttribute('href'),
    ).toBe(`/sellers/${SELLER.id}`);
    expect(within(table).getByText('Escalated')).toBeDefined();
    expect(within(table).getByText('Waiting for seller')).toBeDefined();
    expect(within(table).getAllByText('Damaged')).toHaveLength(2);
    // Only the requested one has a deadline that matters now.
    expect(within(table).getAllByText('—')).toHaveLength(1);
    expect(queries[0]).toEqual({ limit: '20', sort: '-createdAt', 'status[in]': 'escalated,disputed' });
    expect(screen.getByRole('link', { name: 'Needs decision' }).getAttribute('aria-current')).toBe('page');
  });

  it('tab, reasons, seller and customer from the URL reach the API; scopes are named chips', async () => {
    const queries = serveList([]);
    renderWithProviders(
      <ReturnsList
        params={{ tab: 'closed', reason: 'wrong_item,damaged', seller: SELLER.id, customer: CUSTOMER.id }}
      />,
    );
    expect(await screen.findByText('No returns match these filters.')).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      sort: '-createdAt',
      'status[in]': 'completed,refused,cancelled,pickup_failed',
      'reason[in]': 'damaged,wrong_item',
      'sellerId[eq]': SELLER.id,
      'customerId[eq]': CUSTOMER.id,
    });
    const scopes = screen.getByRole('list', { name: 'Showing returns of' });
    expect(await within(scopes).findByText('Seller: Nile Crafts')).toBeDefined();
    expect(await within(scopes).findByText('Customer: Mona Ali')).toBeDefined();
    expect(
      within(scopes).getByRole('link', { name: 'Remove Seller: Nile Crafts' }).getAttribute('href'),
    ).toBe(`/returns?tab=closed&reason=damaged%2Cwrong_item&customer=${CUSTOMER.id}`);
  });

  it('one reason is sent with [eq]; ticking a reason navigates', async () => {
    const queries = serveList([]);
    const view = renderWithProviders(<ReturnsList params={{ tab: 'waiting-seller', reason: 'damaged' }} />);
    expect(await screen.findByText('No returns match these filters.')).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      sort: '-createdAt',
      'status[eq]': 'requested',
      'reason[eq]': 'damaged',
    });
    await view.user.click(screen.getByRole('checkbox', { name: 'Changed their mind' }));
    expect(router.push).toHaveBeenCalledWith('/returns?tab=waiting-seller&reason=damaged%2Cchanged_mind');
  });

  it('a failed list offers a retry', async () => {
    server.use(
      mockApi('get', '/admin/returns', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderWithProviders(<ReturnsList params={{}} />);
    expect(await screen.findByText("The returns couldn't be loaded.")).toBeDefined();
  });
});

describe('return (spec 03 AD-33, T-M7)', { timeout: 20_000 }, () => {
  it('parties, items, refund with the payout method only, the return shipment and the history', async () => {
    const item: Return = {
      ...RETURN,
      status: 'completed',
      payoutMethod: 'mobile_wallet',
      refund: { status: 'manual', amount: '150.00', refundedAt: null },
    };
    serveReturn(item);
    const shipment = adminShipmentFactory({ orderId: item.orderId, kind: 'return', returnId: item.id });
    const shipmentQueries: Record<string, string>[] = [];
    server.use(
      mockApi(
        'get',
        '/admin/shipments',
        ({ request, reply }) => {
          shipmentQueries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([adminShipmentFactory({ kind: 'return', returnId: null }), shipment], {
            ...PAGE,
            limit: 50,
          });
        },
        { base: BFF_BASE },
      ),
    );
    renderDetail(item);
    expect(
      await screen.findByRole('heading', { level: 1, name: `Return ${item.returnNumber}` }),
    ).toBeDefined();
    const details = screen.getByLabelText('Return details');
    expect((await within(details).findByRole('link', { name: 'Mona Ali' })).getAttribute('href')).toBe(
      `/customers/${CUSTOMER.id}`,
    );
    expect((await within(details).findByRole('link', { name: 'Nile Crafts' })).getAttribute('href')).toBe(
      `/sellers/${SELLER.id}`,
    );
    expect(within(details).getByText('Not assigned')).toBeDefined();
    expect(within(details).getByText('Used item.')).toBeDefined();
    expect(screen.getByText('The handle broke.')).toBeDefined();
    expect(screen.getByText('Qty 1')).toBeDefined();
    expect(screen.getByText('Mobile wallet')).toBeDefined();
    expect(screen.getByText('Payout details are on the refund.')).toBeDefined();
    expect(screen.getByText('Being processed by our team')).toBeDefined();
    expect((await screen.findByRole('link', { name: 'Open the return shipment' })).getAttribute('href')).toBe(
      `/delivery/shipments/${shipment.id}`,
    );
    expect(shipmentQueries[0]).toMatchObject({ 'orderId[eq]': item.orderId, 'kind[eq]': 'return' });
    const history = screen.getByRole('table', { name: 'Status changes, oldest first' });
    expect(within(history).getByText('Requested → Waiting for seller')).toBeDefined();
    expect(within(history).getByText('Waiting for seller → Rejected by seller')).toBeDefined();
    // A seller change without a user id reads as the role.
    expect(within(history).getByText('Seller')).toBeDefined();
    // Completed: nothing to decide.
    expect(screen.queryByRole('group', { name: 'Return actions' })).toBeNull();
  });

  it('decide: approve needs a note, shows a summary, sends decision + note, answer replaces the page', async () => {
    const state = serveReturn(RETURN);
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/returns/{returnId}/decide',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          state.item = { ...RETURN, status: 'approved' };
          return reply.ok(state.item);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Approve…' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve return' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeDefined();
    expect(within(dialog).getByText('Your decision is final.')).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Note/ }), ' Photos show damage ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const confirm = screen.getByRole('dialog', { name: 'Check and confirm' });
    expect(within(confirm).getByText(/^Approve return RT-\d+\? .* Note: Photos show damage$/)).toBeDefined();
    await view.user.click(within(confirm).getByRole('button', { name: 'Approve return' }));
    expect(await screen.findByText(`Return ${RETURN.returnNumber} is decided.`)).toBeDefined();
    expect(bodies).toEqual([{ decision: 'approve', note: 'Photos show damage' }]);
    expect(await screen.findByText('Approved')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Approve…' })).toBeNull();
  });

  it('resolve dispute: "Refund the customer" carries an Idempotency-Key, kept when the same intent is retried', async () => {
    const disputed = { ...RETURN, status: 'disputed' as const };
    const state = serveReturn(disputed);
    const keys: (string | null)[] = [];
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/returns/{returnId}/resolve-dispute',
        async ({ request, reply }) => {
          keys.push(request.headers.get('Idempotency-Key'));
          bodies.push(await request.json());
          if (keys.length === 1) return reply.error(500, 'INTERNAL_ERROR');
          state.item = { ...disputed, status: 'completed' };
          return reply.ok(state.item);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail(disputed);
    await view.user.click(await screen.findByRole('button', { name: 'Refund the customer…' }));
    const dialog = screen.getByRole('dialog', { name: 'Refund the customer' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Note/ }), 'Seller report unclear');
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const confirm = screen.getByRole('dialog', { name: 'Check and confirm' });
    expect(
      within(confirm).getByText(/Nothing is restocked: the seller adjusts stock by hand\./),
    ).toBeDefined();
    await view.user.click(within(confirm).getByRole('button', { name: 'Refund the customer' }));
    expect(await within(confirm).findByRole('alert')).toBeDefined();
    await view.user.click(within(confirm).getByRole('button', { name: 'Refund the customer' }));
    expect(
      await screen.findByText(`The dispute on return ${RETURN.returnNumber} is resolved.`),
    ).toBeDefined();
    expect(bodies).toEqual([
      { decision: 'refund', note: 'Seller report unclear' },
      { decision: 'refund', note: 'Seller report unclear' },
    ]);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
  });

  it('RETURN_INVALID_STATUS_TRANSITION closes the dialog, reads the return again and explains', async () => {
    const state = serveReturn(RETURN);
    server.use(
      mockApi(
        'post',
        '/admin/returns/{returnId}/decide',
        ({ reply }) => {
          state.item = { ...RETURN, status: 'cancelled' };
          return reply.error(409, 'RETURN_INVALID_STATUS_TRANSITION');
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Reject…' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject return' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Note/ }), 'Outside policy');
    await view.user.click(within(dialog).getByRole('button', { name: 'Continue' }));
    const reads = state.reads;
    await view.user.click(screen.getByRole('button', { name: 'Reject return' }));
    expect(
      await screen.findByText('This return changed meanwhile. Here is its current state.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(state.reads).toBeGreaterThan(reads);
    });
    expect(await screen.findByText('Cancelled by customer')).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('an unknown return is "not found"', async () => {
    server.use(
      mockApi('get', '/admin/returns/{returnId}', ({ reply }) => reply.error(404, 'RETURN_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderDetail();
    expect(await screen.findByText("This return doesn't exist.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to returns' }).getAttribute('href')).toBe('/returns');
  });
});
