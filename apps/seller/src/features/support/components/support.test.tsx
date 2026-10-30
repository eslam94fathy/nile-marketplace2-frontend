// @vitest-environment jsdom
import {
  fixtureId,
  mockApi,
  sellerOrderFactory,
  sellerProductFactory,
  ticketFactory,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { loadSellerOrderChoices } from '../api';
import { NewSellerTicket } from './new-seller-ticket';
import { SupportKeeper } from './support-keeper';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

const PAGE = { nextCursor: null, hasMore: false, limit: 20 };
const RECENT = sellerOrderFactory({ orderNumber: 'NM-9' });
const OLDER = sellerOrderFactory({ orderNumber: 'NM-1' });
/** The first render of a file also loads its modules: more time than the 1 s default on a busy machine. */
const FIRST_RENDER = { timeout: 5_000 };

function serveSellerOrders() {
  server.use(
    mockApi('get', '/seller/orders', ({ reply }) => reply.ok([RECENT], PAGE), { base: BFF_BASE }),
    mockApi(
      'get',
      '/seller/orders/{sellerOrderId}',
      ({ params, reply }) =>
        String(params.sellerOrderId) === OLDER.id
          ? reply.ok(OLDER)
          : reply.error(404, 'SELLER_ORDER_NOT_FOUND'),
      { base: BFF_BASE },
    ),
  );
}

function serveOpen() {
  const calls: { body: unknown; key: string | null }[] = [];
  server.use(
    http.post(`${BFF_BASE}/support/tickets`, async ({ request }) => {
      calls.push({ body: await request.json(), key: request.headers.get('Idempotency-Key') });
      return HttpResponse.json({ success: true, data: ticketFactory() }, { status: 201 });
    }),
  );
  return calls;
}

const renderForm = (props: Partial<Parameters<typeof NewSellerTicket>[0]> = {}) =>
  renderWithProviders(
    <SupportKeeper>
      <NewSellerTicket category={null} sellerOrderId={null} productId={null} {...props} />
    </SupportKeeper>,
  );

beforeEach(() => {
  router.push.mockReset();
  serveSellerOrders();
});

describe('seller order choices (spec 02 SE-25)', () => {
  it('the latest seller orders, plus the URL one first when older; a missing one is not offered', async () => {
    const signal = new AbortController().signal;
    expect(await loadSellerOrderChoices(null, signal)).toEqual([{ id: RECENT.id, orderNumber: 'NM-9' }]);
    expect(await loadSellerOrderChoices(OLDER.id, signal)).toEqual([
      { id: OLDER.id, orderNumber: 'NM-1' },
      { id: RECENT.id, orderNumber: 'NM-9' },
    ]);
    expect(await loadSellerOrderChoices(fixtureId(7999), signal)).toEqual([
      { id: RECENT.id, orderNumber: 'NM-9' },
    ]);
  });
});

describe('new seller ticket (spec 02 SE-25)', { timeout: 20_000 }, () => {
  it('seller categories include "Seller account"; the URL seller order is sent as sellerOrderId only', async () => {
    const calls = serveOpen();
    const view = renderForm({ category: 'return', sellerOrderId: OLDER.id });
    const order = await screen.findByRole('combobox', { name: /^Order/ }, FIRST_RENDER);
    expect(order.textContent).toContain('Order NM-1');
    await view.user.click(screen.getByRole('combobox', { name: /^Category/ }));
    expect(await screen.findByRole('option', { name: 'Seller account' })).toBeDefined();
    await view.user.click(screen.getByRole('option', { name: 'Return' }));
    await view.user.type(screen.getByRole('textbox', { name: /^Subject/ }), 'Damaged on arrival');
    await view.user.type(screen.getByRole('textbox', { name: /^Message/ }), 'The customer says so.');
    await view.user.click(screen.getByRole('button', { name: 'Send ticket' }));
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]?.body).toEqual({
      category: 'return',
      subject: 'Damaged on arrival',
      body: 'The customer says so.',
      sellerOrderId: OLDER.id,
    });
    expect(calls[0]?.key).not.toBeNull();
  });

  it('from a blocked product: category Account and the subject naming the product', async () => {
    const product = sellerProductFactory({ name: 'Fake watch' });
    server.use(
      mockApi('get', '/seller/products/{productId}', ({ reply }) => reply.ok(product), { base: BFF_BASE }),
    );
    renderForm({ category: 'account', productId: product.id });
    const subject = await screen.findByRole('textbox', { name: /^Subject/ }, FIRST_RENDER);
    expect((subject as HTMLInputElement).value).toBe('Blocked product: Fake watch');
    expect(screen.getByRole('combobox', { name: /^Category/ }).textContent).toContain('Account');
  });

  it("a product that can't be read leaves the subject empty", async () => {
    server.use(
      mockApi('get', '/seller/products/{productId}', ({ reply }) => reply.error(404, 'PRODUCT_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderForm({ category: 'account', productId: fixtureId(2999) });
    const subject = await screen.findByRole('textbox', { name: /^Subject/ }, FIRST_RENDER);
    expect((subject as HTMLInputElement).value).toBe('');
  });
});
