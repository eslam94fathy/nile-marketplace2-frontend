// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { adminSellerDetailFactory, couponFactory, fixtureId, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { CouponDetail } from './coupon-detail';
import { CouponsList } from './coupons-list';
import { NewCoupon } from './new-coupon';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Coupon = Schema<'AdminCouponDetailDto'>;

const PAGE = { nextCursor: null, hasMore: false, limit: 20 };
const SELLER = adminSellerDetailFactory({ businessName: 'Nile Crafts' });
const CATEGORY = fixtureId(3002);
const CATEGORY_TREE: Schema<'AdminCategoryNodeDto'>[] = [
  {
    id: fixtureId(3001),
    parentId: null,
    name: 'Fashion',
    slug: 'fashion',
    depth: 1,
    sortOrder: 1,
    isActive: true,
    image: null,
    attributes: [],
    children: [
      {
        id: CATEGORY,
        parentId: fixtureId(3001),
        name: 'Shirts',
        slug: 'shirts',
        depth: 2,
        sortOrder: 1,
        isActive: true,
        image: null,
        attributes: [],
        children: [],
      },
    ],
  },
];

/** A platform coupon for every product, used twice. */
const PLATFORM: Coupon = {
  ...couponFactory({
    code: 'NILE15',
    funding: 'platform',
    sellerId: null,
    scope: 'all',
    discountValue: '0.1500',
    globalLimit: 100,
  }),
  redemptions: [],
};

/** A seller-funded coupon on one category. */
const SELLERS: Coupon = {
  ...couponFactory({
    code: 'CRAFTS10',
    sellerId: SELLER.id,
    scope: 'category',
    scopeSellerId: SELLER.id,
    scopeCategoryId: CATEGORY,
    redemptionCount: 1,
  }),
  redemptions: [
    {
      orderId: fixtureId(14001),
      customerId: fixtureId(23501),
      discountTotal: '20.00',
      status: 'active',
      createdAt: '2026-10-20T10:00:00.000Z',
    },
  ],
};

const ok = (data: unknown, status = 200) => HttpResponse.json({ success: true, data }, { status });
const fail = (status: number, code: ErrorCode) =>
  HttpResponse.json(
    { success: false, error: { code, message: code, details: [] }, correlationId: 'corr-1' },
    { status },
  );

beforeEach(() => {
  router.push.mockReset();
  server.use(
    mockApi('get', '/admin/sellers/{sellerId}', ({ reply }) => reply.ok(SELLER), { base: BFF_BASE }),
    mockApi('get', '/admin/categories', ({ reply }) => reply.ok(CATEGORY_TREE), { base: BFF_BASE }),
  );
});

function serveList(rows: Schema<'CouponDto'>[]) {
  const queries: Record<string, string>[] = [];
  server.use(
    mockApi(
      'get',
      '/admin/coupons',
      ({ request, reply }) => {
        queries.push(Object.fromEntries(new URL(request.url).searchParams));
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

function serveCoupon(initial: Coupon) {
  const state = { coupon: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/coupons/{couponId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.coupon);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

function serveWrite(method: 'post' | 'patch', path: string, answer: () => Response) {
  const bodies: unknown[] = [];
  server.use(
    http[method](`${BFF_BASE}${path}`, async ({ request }) => {
      bodies.push(await request.json());
      return answer();
    }),
  );
  return bodies;
}

const renderWithToasts = (node: ReactNode) =>
  renderWithProviders(
    <>
      {node}
      <Toaster />
    </>,
  );

async function enabled(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => {
    expect(button.hasAttribute('disabled')).toBe(false);
  });
  return button;
}

describe('coupons (spec 03 AD-35, T-M9)', { timeout: 15_000 }, () => {
  it('newest first; rows name the funder, discount, scope, uses, status and a block', async () => {
    const queries = serveList([PLATFORM, { ...SELLERS, adminBlocked: true, displayStatus: 'inactive' }]);
    renderWithProviders(<CouponsList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Coupons, newest first' });
    expect(queries[0]).toEqual({ limit: '20', sort: '-createdAt' });
    expect(within(table).getByRole('link', { name: 'NILE15' }).getAttribute('href')).toBe(
      `/coupons/${PLATFORM.id}`,
    );
    expect(within(table).getByText('Nile')).toBeDefined();
    expect(await within(table).findByText('Nile Crafts')).toBeDefined();
    expect(within(table).getByText('15 %')).toBeDefined();
    expect(within(table).getByText('All products')).toBeDefined();
    expect(await within(table).findByText('Fashion › Shirts')).toBeDefined();
    expect(within(table).getByText('0 of 100')).toBeDefined();
    expect(within(table).getByText('Blocked')).toBeDefined();
    expect(screen.getByRole('link', { name: 'New coupon' }).getAttribute('href')).toBe('/coupons/new');
  });

  it('funding, status, seller and code from the URL reach the API; the code is found exactly, upper-cased', async () => {
    const queries = serveList([]);
    const view = renderWithProviders(
      <CouponsList params={{ funding: 'seller', status: 'inactive', seller: SELLER.id }} />,
    );
    expect(await screen.findByText('No coupons match these filters.')).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      sort: '-createdAt',
      'funding[eq]': 'seller',
      'status[eq]': 'inactive',
      'sellerId[eq]': SELLER.id,
    });
    const scopes = screen.getByRole('list', { name: 'Showing coupons of' });
    expect(await within(scopes).findByText('Seller: Nile Crafts')).toBeDefined();
    await view.user.type(screen.getByRole('textbox', { name: 'Code' }), ' crafts10 ');
    await view.user.click(screen.getByRole('button', { name: 'Find' }));
    expect(router.push).toHaveBeenCalledWith(
      `/coupons?funding=seller&status=inactive&seller=${SELLER.id}&code=CRAFTS10`,
    );
  });
});

describe('new coupon (spec 03 AD-36, T-M9)', { timeout: 20_000 }, () => {
  it('all products: the documented fields; then the coupon opens', async () => {
    const created = couponFactory({ code: 'WELCOME', funding: 'platform', sellerId: null, scope: 'all' });
    const bodies = serveWrite('post', '/admin/coupons', () => ok(created, 201));
    const view = renderWithToasts(<NewCoupon />);
    await view.user.type(await screen.findByRole('textbox', { name: /^Code/ }), 'welcome');
    await view.user.type(screen.getByRole('textbox', { name: /^Discount \(%\)/ }), '15');
    await view.user.type(screen.getByLabelText(/^Ends/), '2999-01-01T10:00');
    await view.user.click(await enabled('Create coupon'));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]).toMatchObject({
      scope: 'all',
      code: 'WELCOME',
      discountType: 'percent',
      discountValue: '0.1500',
      minItemsSubtotal: '0.00',
      perCustomerLimit: 1,
    });
    expect(bodies[0]).not.toHaveProperty('scopeSellerId');
    expect(bodies[0]).not.toHaveProperty('status');
    expect(router.push).toHaveBeenCalledWith(`/coupons/${created.id}`);
  });

  it('one seller: a seller must be chosen by search; SELLER_NOT_FOUND lands on it', async () => {
    server.use(
      mockApi('get', '/admin/sellers', ({ reply }) => reply.ok([SELLER], { ...PAGE, limit: 10 }), {
        base: BFF_BASE,
      }),
    );
    const bodies = serveWrite('post', '/admin/coupons', () => fail(422, 'SELLER_NOT_FOUND'));
    const view = renderWithToasts(<NewCoupon />);
    await view.user.type(await screen.findByRole('textbox', { name: /^Code/ }), 'CRAFTY');
    await view.user.type(screen.getByRole('textbox', { name: /^Discount \(%\)/ }), '10');
    await view.user.type(screen.getByLabelText(/^Ends/), '2999-01-01T10:00');
    await view.user.click(screen.getByRole('combobox', { name: /^Applies to/ }));
    await view.user.click(await screen.findByRole('option', { name: 'One seller' }));
    await view.user.click(await enabled('Create coupon'));
    expect(await screen.findByText('Choose a seller.')).toBeDefined();
    expect(bodies).toEqual([]);
    await view.user.type(screen.getByRole('searchbox', { name: /^Seller/ }), 'Nile');
    await view.user.click(await screen.findByRole('button', { name: 'Choose Nile Crafts' }));
    expect(await screen.findByRole('button', { name: 'Change seller' })).toBeDefined();
    await view.user.click(await enabled('Create coupon'));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]).toMatchObject({ scope: 'seller', scopeSellerId: SELLER.id });
    expect(await screen.findByText('This seller no longer exists. Choose another.')).toBeDefined();
  });
});

describe('coupon (spec 03 AD-37, T-M9)', { timeout: 20_000 }, () => {
  it('a platform coupon: the edit form sends only what changed', async () => {
    const state = serveCoupon(PLATFORM);
    const bodies = serveWrite('patch', `/admin/coupons/${PLATFORM.id}`, () => {
      state.coupon = { ...PLATFORM, perCustomerLimit: 3, updatedAt: '2026-10-31T09:00:00.000Z' };
      return ok(state.coupon);
    });
    const view = renderWithToasts(<CouponDetail couponId={PLATFORM.id} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'NILE15' })).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Coupon actions' })).toBeNull();
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    const perCustomer = screen.getByRole('spinbutton', { name: /^Uses per customer/ });
    await view.user.clear(perCustomer);
    await view.user.type(perCustomer, '3');
    await view.user.click(await enabled('Save'));
    expect(await screen.findByText('Coupon saved.')).toBeDefined();
    expect(bodies).toEqual([{ perCustomerLimit: 3 }]);
    expect(screen.getByText('Not used yet.')).toBeDefined();
  });

  it('a seller coupon: read-only with its redemptions; Block needs a reason', async () => {
    const state = serveCoupon(SELLERS);
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/coupons/{couponId}/block',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          state.coupon = {
            ...SELLERS,
            adminBlocked: true,
            adminBlockReason: 'Misleading code',
            status: 'inactive',
            displayStatus: 'inactive',
          };
          return reply.ok(state.coupon);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithToasts(<CouponDetail couponId={SELLERS.id} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'CRAFTS10' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(
      screen.getByText('Seller coupons are managed by their seller. Nile can only block them.'),
    ).toBeDefined();
    const details = screen.getByLabelText('Coupon details');
    expect((await within(details).findByRole('link', { name: 'Nile Crafts' })).getAttribute('href')).toBe(
      `/sellers/${SELLER.id}`,
    );
    const redemptions = screen.getByRole('table', { name: 'The last 50 redemptions, newest first' });
    expect(within(redemptions).getByText('Used')).toBeDefined();
    expect(
      within(redemptions)
        .getByRole('link', { name: fixtureId(23501).slice(0, 8) })
        .getAttribute('href'),
    ).toBe(`/customers/${fixtureId(23501)}`);

    await view.user.click(screen.getByRole('button', { name: 'Block' }));
    const dialog = screen.getByRole('dialog', { name: 'Block coupon' });
    expect(
      within(dialog).getByText(
        "The coupon is turned off at once. The seller can't activate it while it's blocked.",
      ),
    ).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Block' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), ' Misleading code ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Block' }));
    expect(await screen.findByText('CRAFTS10 is blocked.')).toBeDefined();
    expect(bodies).toEqual([{ reason: 'Misleading code' }]);
    expect(await screen.findByText('Misleading code')).toBeDefined();
    expect(await screen.findByRole('button', { name: 'Unblock' })).toBeDefined();
  });

  it('COUPON_BLOCK_INVALID_STATUS on unblock reads the coupon again and explains', async () => {
    const blocked = { ...SELLERS, adminBlocked: true, adminBlockReason: 'Misleading code' };
    const state = serveCoupon(blocked);
    server.use(
      mockApi(
        'post',
        '/admin/coupons/{couponId}/unblock',
        ({ reply }) => {
          state.coupon = SELLERS;
          return reply.error(409, 'COUPON_BLOCK_INVALID_STATUS');
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderWithToasts(<CouponDetail couponId={SELLERS.id} />);
    await view.user.click(await screen.findByRole('button', { name: 'Unblock' }));
    const reads = state.reads;
    await view.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unblock' }));
    expect(
      await screen.findByText('This coupon changed meanwhile. Here is its current state.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(state.reads).toBeGreaterThan(reads);
    });
    expect(await screen.findByRole('button', { name: 'Block' })).toBeDefined();
  });

  it('an unknown coupon is "not found"', async () => {
    server.use(
      mockApi('get', '/admin/coupons/{couponId}', ({ reply }) => reply.error(404, 'COUPON_NOT_FOUND'), {
        base: BFF_BASE,
      }),
    );
    renderWithProviders(<CouponDetail couponId={PLATFORM.id} />);
    expect(await screen.findByText("This coupon doesn't exist.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to coupons' }).getAttribute('href')).toBe('/coupons');
  });
});
