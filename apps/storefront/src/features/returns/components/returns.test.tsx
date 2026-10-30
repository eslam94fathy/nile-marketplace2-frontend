// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import type * as Media from '@nile/media';
import { fixtureId, imageFactory, mockApi, orderDetailFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderDetail } from '@/features/orders';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import type { Return } from '../api';
import { RequestReturn } from './request-return';
import { ReturnDetail } from './return-detail';
import { ReturnsList } from './returns-list';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/use-has-session', () => ({ useHasSession: () => true }));
vi.mock('@nile/media', async (importOriginal) => {
  const media = await importOriginal<typeof Media>();
  return {
    ...media,
    useImageUploads: (options: Parameters<typeof media.useImageUploads>[0]) =>
      media.useImageUploads({
        ...options,
        decode: () => Promise.resolve({ width: 800, height: 600 }),
        previews: { create: (file) => `blob:${(file as File).name}`, revoke: () => undefined },
      }),
  };
});

const server = setupMswServer();

beforeEach(() => {
  push.mockReset();
});

type Order = Schema<'OrderDetailDto'>;
type SellerOrder = Order['sellerOrders'][number];

const ORDER_ID = fixtureId(0x900);
const SELLER_ORDER_ID = fixtureId(0x901);
const ITEM_A = fixtureId(0x902);
const ITEM_B = fixtureId(0x903);
const RETURN_ID = fixtureId(0xb00);

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

function item(id: string, name: string): SellerOrder['items'][number] {
  return {
    id,
    productId: fixtureId(0x702),
    variantId: fixtureId(0x701),
    productName: name,
    sku: 'SKU',
    attributes: [{ attribute: 'Size', value: 'M' }],
    unitPrice: '250.00',
    quantity: 2,
    cancelledQuantity: 0,
    lineTotal: '500.00',
    returnedQuantity: 0,
    discountAmount: '0.00',
    paidTotal: '500.00',
    image: null,
  };
}

function order(overrides: Partial<Order> = {}, deliveredAt = hoursAgo(24)): Order {
  return {
    ...orderDetailFactory({ id: ORDER_ID, orderNumber: 'NM-2026-000001' }),
    status: 'completed',
    sellerOrders: [
      {
        id: SELLER_ORDER_ID,
        sellerId: fixtureId(0x600),
        businessName: 'Nile Crafts',
        status: 'delivered',
        subtotal: '1000.00',
        discountAmount: '0.00',
        discountFunding: null,
        returnedPaid: '0.00',
        cancelReason: null,
        canCancel: false,
        items: [item(ITEM_A, 'Linen shirt'), item(ITEM_B, 'Wool scarf')],
        timeline: [{ status: 'delivered', at: deliveredAt }],
      },
    ],
    ...overrides,
  };
}

function serveOrder(data: Order) {
  server.use(mockApi('get', '/orders/{orderId}', ({ reply }) => reply.ok(data), { base: BFF_BASE }));
}

function serveReturnable(answer: 'ok' | 'RETURN_WINDOW_CLOSED' | 'RETURN_PICKUP_UNAVAILABLE', fee = '45.00') {
  server.use(
    mockApi(
      'get',
      '/orders/{orderId}/seller-orders/{sellerOrderId}/returnable-items',
      ({ reply }) =>
        answer === 'ok'
          ? reply.ok({
              windowEndsAt: inHours(24 * 10),
              returnFee: fee,
              items: [
                { orderItemId: ITEM_A, returnable: 2, paidUnitAmount: '250.00' },
                { orderItemId: ITEM_B, returnable: 1, paidUnitAmount: '120.00' },
              ],
            })
          : reply.error(422, answer),
      { base: BFF_BASE },
    ),
  );
}

function aReturn(overrides: Partial<Return> = {}): Return {
  return {
    id: RETURN_ID,
    returnNumber: 'RT-2026-000001',
    orderId: ORDER_ID,
    orderNumber: 'NM-2026-000001',
    sellerOrderId: SELLER_ORDER_ID,
    status: 'requested',
    reason: 'damaged',
    description: 'Torn seam.',
    items: [
      {
        id: fixtureId(0xb01),
        orderItemId: ITEM_A,
        productName: 'Linen shirt',
        attributes: [],
        image: null,
        quantity: 1,
        paidAmount: '250.00',
        restock: null,
      },
    ],
    photos: [],
    returnFee: '45.00',
    returnFeePayer: 'seller',
    refundAmount: '250.00',
    refund: null,
    sellerDecisionDeadlineAt: inHours(40),
    escalationDeadlineAt: null,
    inspectionDeadlineAt: null,
    rejectionReason: null,
    refusalReason: null,
    timeline: [{ status: 'requested', at: hoursAgo(2) }],
    createdAt: hoursAgo(2),
    ...overrides,
  };
}

function servePost() {
  const sent: { body: unknown; key: string | null }[] = [];
  server.use(
    http.post(`${BFF_BASE}/returns`, async ({ request }) => {
      sent.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') });
      return HttpResponse.json({ success: true, data: aReturn() }, { status: 201 });
    }),
  );
  return sent;
}

function renderRequest() {
  return renderWithProviders(
    <>
      <RequestReturn orderId={ORDER_ID} sellerOrderId={SELLER_ORDER_ID} />
      <Toaster />
    </>,
  );
}

describe('request a return (spec 01 SF-26)', { timeout: 20_000 }, () => {
  it('card order, "Changed my mind": the fee note, the estimate, no payout, the body', async () => {
    serveOrder(order({ paymentMethod: 'kashier' }));
    serveReturnable('ok');
    const sent = servePost();
    const view = renderRequest();
    await view.user.click(await screen.findByRole('button', { name: 'Increase quantity, Linen shirt' }));
    await view.user.click(screen.getByRole('radio', { name: 'Changed my mind' }));
    expect(
      screen.getByText(/^The return delivery fee of .*45\.00 is taken from your refund\.$/),
    ).toBeDefined();
    expect(screen.getByText('Your refund goes back to your card.')).toBeDefined();
    expect(screen.queryByRole('radio', { name: 'Mobile wallet' })).toBeNull();
    const summary = screen.getByRole('region', { name: 'Summary' });
    expect(within(summary).getByText('Estimated refund').nextElementSibling?.textContent).toMatch(/205\.00/);
    await view.user.click(screen.getByRole('button', { name: 'Request return' }));
    expect(await screen.findByText('Return RT-2026-000001 requested.')).toBeDefined();
    expect(sent[0]?.body).toEqual({
      sellerOrderId: SELLER_ORDER_ID,
      reason: 'changed_mind',
      items: [{ orderItemId: ITEM_A, quantity: 1 }],
    });
    expect(sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(push).toHaveBeenCalledWith(`/account/returns/${RETURN_ID}`);
  });

  it('nothing chosen: "Choose at least one item"; a seller-fault reason needs a photo', async () => {
    serveOrder(order({ paymentMethod: 'kashier' }));
    serveReturnable('ok');
    const sent = servePost();
    const view = renderRequest();
    await view.user.click(await screen.findByRole('radio', { name: 'Damaged' }));
    expect(screen.getByText('Returning is free for you.')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Request return' }));
    expect(await screen.findByText('Choose at least one item to return.')).toBeDefined();
    expect(screen.getByText('Add at least one photo showing the problem.')).toBeDefined();
    expect(sent).toEqual([]);
  });

  it('COD: the payout is required; the wallet number is sent in E.164', async () => {
    serveOrder(order({ paymentMethod: 'cod' }));
    serveReturnable('ok');
    const sent = servePost();
    const view = renderRequest();
    await view.user.click(await screen.findByRole('button', { name: 'Increase quantity, Wool scarf' }));
    await view.user.click(screen.getByRole('radio', { name: 'Changed my mind' }));
    await view.user.click(screen.getByRole('button', { name: 'Request return' }));
    expect(await screen.findByText('Choose where to send your refund.')).toBeDefined();
    await view.user.click(screen.getByRole('radio', { name: 'Mobile wallet' }));
    await view.user.type(screen.getByRole('textbox', { name: /Wallet mobile number/ }), '1012345678');
    expect(screen.getByText('We use this only to send your refund, then delete it.')).toBeDefined();
    await view.user.click(screen.getByRole('button', { name: 'Request return' }));
    await waitFor(() => {
      expect(sent).toHaveLength(1);
    });
    expect(sent[0]?.body).toMatchObject({
      items: [{ orderItemId: ITEM_B, quantity: 1 }],
      refundPayout: { method: 'mobile_wallet', walletNumber: '+201012345678' },
    });
  });

  it.each([
    ['RETURN_WINDOW_CLOSED', /^The return period for this order ended on /],
    ['RETURN_PICKUP_UNAVAILABLE', /^We can't collect returns from your area right now\.$/],
  ] as const)('read refusal %s is explained', async (code, message) => {
    serveOrder(order());
    serveReturnable(code);
    renderRequest();
    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to your order' }).getAttribute('href')).toBe(
      `/account/orders/${ORDER_ID}`,
    );
  });

  it('RETURN_ALREADY_OPEN: links to the open returns', async () => {
    serveOrder(order({ paymentMethod: 'kashier' }));
    serveReturnable('ok');
    server.use(
      http.post(`${BFF_BASE}/returns`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'RETURN_ALREADY_OPEN', message: 'x' }, correlationId: 'c' },
          { status: 409 },
        ),
      ),
    );
    const view = renderRequest();
    await view.user.click(await screen.findByRole('button', { name: 'Increase quantity, Linen shirt' }));
    await view.user.click(screen.getByRole('radio', { name: 'Changed my mind' }));
    await view.user.click(screen.getByRole('button', { name: 'Request return' }));
    expect((await screen.findByRole('link', { name: 'See your open returns' })).getAttribute('href')).toBe(
      '/account/returns?status=open',
    );
  });
});

function serveReturn(data: Return | 'not-found') {
  let calls = 0;
  server.use(
    mockApi(
      'get',
      '/returns/{returnId}',
      ({ reply }) => {
        calls += 1;
        return data === 'not-found' ? reply.error(404, 'RETURN_NOT_FOUND') : reply.ok(data);
      },
      { base: BFF_BASE },
    ),
  );
  return () => calls;
}

describe('return detail (spec 01 SF-28)', { timeout: 20_000 }, () => {
  it('requested: status, next step with the deadline, items, reason, estimated refund, history, Cancel', async () => {
    serveReturn(aReturn());
    renderWithProviders(<ReturnDetail returnId={RETURN_ID} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Return RT-2026-000001' })).toBeDefined();
    expect(screen.getAllByText('Waiting for the seller').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/^The seller has until .* to respond\. If they don't, your return is approved\.$/),
    ).toBeDefined();
    expect(screen.getByText('Damaged')).toBeDefined();
    expect(screen.getByText('Estimated refund')).toBeDefined();
    expect(screen.getByText('Paid by the seller')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Order NM-2026-000001' }).getAttribute('href')).toBe(
      `/account/orders/${ORDER_ID}`,
    );
    expect(screen.getByRole('button', { name: 'Cancel return' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Ask Nile to review' })).toBeNull();
  });

  it('cancel: confirm, POST, refetch; already collected is explained', async () => {
    const calls = serveReturn(aReturn({ status: 'approved' }));
    server.use(
      http.post(`${BFF_BASE}/returns/:returnId/cancel`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'RETURN_INVALID_STATUS_TRANSITION', message: 'x' },
            correlationId: 'c',
          },
          { status: 409 },
        ),
      ),
    );
    const view = renderWithProviders(<ReturnDetail returnId={RETURN_ID} />);
    await view.user.click(await screen.findByRole('button', { name: 'Cancel return' }));
    const dialog = screen.getByRole('dialog', { name: 'Cancel this return?' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel return' }));
    expect(
      await screen.findByText(
        "The agent has already collected the items, so this return can't be cancelled.",
      ),
    ).toBeDefined();
    await waitFor(() => {
      expect(calls()).toBe(2);
    });
  });

  it('rejected before the deadline: the seller reason and "Ask Nile to review" with a note', async () => {
    serveReturn(
      aReturn({
        status: 'rejected',
        rejectionReason: 'Item was used.',
        sellerDecisionDeadlineAt: null,
        escalationDeadlineAt: inHours(100),
      }),
    );
    const notes: unknown[] = [];
    server.use(
      http.post(`${BFF_BASE}/returns/:returnId/escalate`, async ({ request }) => {
        notes.push(await request.json());
        return HttpResponse.json({ success: true, data: aReturn({ status: 'escalated' }) });
      }),
    );
    const view = renderWithProviders(
      <>
        <ReturnDetail returnId={RETURN_ID} />
        <Toaster />
      </>,
    );
    expect(await screen.findByText('Item was used.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Cancel return' })).toBeNull();
    // SF-28: support about this parcel, category Return (T-K7).
    expect(screen.getByRole('link', { name: 'Contact support' }).getAttribute('href')).toBe(
      `/account/support/new?category=return&order=${ORDER_ID}&sellerOrder=${SELLER_ORDER_ID}`,
    );
    await view.user.click(screen.getByRole('button', { name: 'Ask Nile to review' }));
    const dialog = screen.getByRole('dialog', { name: "Ask Nile to review the seller's decision" });
    await view.user.type(within(dialog).getByRole('textbox', { name: 'Why should Nile review it?' }), 'ok');
    await view.user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(within(dialog).getByText('Must be at least 3 characters.')).toBeDefined();
    await view.user.type(
      within(dialog).getByRole('textbox', { name: 'Why should Nile review it?' }),
      ' fine',
    );
    await view.user.click(within(dialog).getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Sent to Nile for review.')).toBeDefined();
    expect(notes).toEqual([{ note: 'ok fine' }]);
  });

  it('completed with a refund: the final amount, refund status and photos (private)', async () => {
    serveReturn(
      aReturn({
        status: 'completed',
        refund: { status: 'succeeded', amount: '250.00', refundedAt: hoursAgo(1) },
        photos: [imageFactory()],
        sellerDecisionDeadlineAt: null,
      }),
    );
    renderWithProviders(<ReturnDetail returnId={RETURN_ID} />);
    expect(await screen.findByText(/^Your refund of .*250\.00 is on its way\.$/)).toBeDefined();
    expect(screen.getByText('Refunded')).toBeDefined();
    expect(screen.queryByText('Estimated refund')).toBeNull();
    expect(screen.getByRole('img', { name: 'Your photo 1 of 1' })).toBeDefined();
  });

  it('refused: the refusal sentence', async () => {
    serveReturn(
      aReturn({ status: 'refused', refusalReason: 'dispute_upheld', sellerDecisionDeadlineAt: null }),
    );
    renderWithProviders(<ReturnDetail returnId={RETURN_ID} />);
    expect(
      await screen.findByText('Nile reviewed the seller’s report and the return wasn’t refunded.'),
    ).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Contact support' })).toBeNull();
  });

  it('pickup failed: "Contact support" about this parcel (TK7-Q4)', async () => {
    serveReturn(aReturn({ status: 'pickup_failed', sellerDecisionDeadlineAt: null }));
    renderWithProviders(<ReturnDetail returnId={RETURN_ID} />);
    expect((await screen.findByRole('link', { name: 'Contact support' })).getAttribute('href')).toBe(
      `/account/support/new?category=return&order=${ORDER_ID}&sellerOrder=${SELLER_ORDER_ID}`,
    );
  });

  it('someone else’s or an unknown return: not found', async () => {
    serveReturn('not-found');
    renderWithProviders(<ReturnDetail returnId={RETURN_ID} />);
    expect(await screen.findByRole('link', { name: 'Your returns' })).toBeDefined();
  });
});

describe('returns list (spec 01 SF-27)', { timeout: 15_000 }, () => {
  it('open tab: status[in] of the open states; row with number, order, items, estimated amount', async () => {
    const queries: string[] = [];
    server.use(
      mockApi(
        'get',
        '/returns',
        ({ request, reply }) => {
          queries.push(decodeURIComponent(new URL(request.url).search));
          return reply.ok([aReturn()], { nextCursor: null, hasMore: false, limit: 20 });
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<ReturnsList tab="open" />);
    const link = await screen.findByRole('link', { name: 'Return RT-2026-000001' });
    expect(link.getAttribute('href')).toBe(`/account/returns/${RETURN_ID}`);
    const row = link.closest('article');
    expect(row?.textContent).toContain('Order NM-2026-000001 · 1 item');
    expect(row?.textContent).toContain('Estimated');
    expect(queries[0]).toBe(
      '?limit=20&sort=-createdAt&status[in]=requested,rejected,escalated,approved,picked_up,received,disputed',
    );
    expect(screen.getByRole('link', { name: 'Open' }).getAttribute('aria-current')).toBe('page');
  });

  it('empty', async () => {
    server.use(
      mockApi(
        'get',
        '/returns',
        ({ reply }) => reply.ok([], { nextCursor: null, hasMore: false, limit: 20 }),
        {
          base: BFF_BASE,
        },
      ),
    );
    renderWithProviders(<ReturnsList tab="closed" />);
    expect(await screen.findByText('You have no returns.')).toBeDefined();
  });
});

describe('SF-18 "Return items" (SF-Q-18)', { timeout: 15_000 }, () => {
  it('on a delivered parcel inside the 14-day window only', async () => {
    serveOrder(order({}, hoursAgo(24)));
    const { unmount } = renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    expect((await screen.findByRole('link', { name: 'Return items' })).getAttribute('href')).toBe(
      `/account/orders/${ORDER_ID}/return?sellerOrder=${SELLER_ORDER_ID}`,
    );
    // Spec 01 §10.3 SF-18: SF-30 with the order preselected (T-K7).
    expect(screen.getByRole('link', { name: 'Get help with this order' }).getAttribute('href')).toBe(
      `/account/support/new?order=${ORDER_ID}`,
    );
    unmount();
    serveOrder(order({}, hoursAgo(24 * 15)));
    renderWithProviders(<OrderDetail orderId={ORDER_ID} />);
    await screen.findByRole('region', { name: 'Sold by Nile Crafts' });
    expect(screen.queryByRole('link', { name: 'Return items' })).toBeNull();
  });
});
