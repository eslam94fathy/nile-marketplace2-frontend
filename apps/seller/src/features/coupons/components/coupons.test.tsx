// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { couponFactory, fixtureId, mockApi, sellerProfileFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { CouponView, NewCoupon } from './coupon-view';
import { CouponsList } from './coupons-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Coupon = Schema<'CouponDto'>;

const PAGE = { nextCursor: null, hasMore: false, limit: 20 };
const CATEGORY = fixtureId(3001);
const COUPON = couponFactory({ code: 'SAVE10', maxDiscount: '50.00', globalLimit: 100, redemptionCount: 0 });

function serveProfile(status: Schema<'SellerProfileDto'>['status'] = 'approved') {
  server.use(
    mockApi('get', '/seller/profile', ({ reply }) => reply.ok(sellerProfileFactory({ status })), {
      base: BFF_BASE,
    }),
  );
}

function serveCategories() {
  server.use(
    mockApi(
      'get',
      '/categories',
      ({ reply }) =>
        reply.ok([
          {
            id: fixtureId(3000),
            name: 'Fashion',
            slug: 'fashion',
            sortOrder: 0,
            image: null,
            children: [
              { id: CATEGORY, name: 'Shirts', slug: 'shirts', sortOrder: 0, image: null, children: [] },
            ],
          },
        ]),
      { base: BFF_BASE },
    ),
  );
}

function serveList(rows: Coupon[]) {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/seller/coupons',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok(rows, PAGE);
      },
      { base: BFF_BASE },
    ),
  );
  return queries;
}

function serveCoupon(initial: Coupon) {
  const state = { coupon: initial, calls: 0 };
  server.use(
    mockApi(
      'get',
      '/seller/coupons/{couponId}',
      ({ reply }) => {
        state.calls += 1;
        return reply.ok(state.coupon);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

const fail = (status: number, code: ErrorCode, details: unknown[] = []) =>
  HttpResponse.json(
    { success: false, error: { code, message: code, details }, correlationId: 'corr-1' },
    { status },
  );

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

const ok = (data: unknown, status = 200) => HttpResponse.json({ success: true, data }, { status });

const renderWithToasts = (node: React.ReactNode) =>
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

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  serveProfile();
  serveCategories();
});

describe('coupons list (spec 02 SE-21)', { timeout: 15_000 }, () => {
  it('rows: code link, discount, scope, dates, uses, display status, blocked', async () => {
    const queries = serveList([
      COUPON,
      couponFactory({
        code: 'FIXED25',
        discountType: 'fixed',
        discountValue: '25.00',
        scope: 'category',
        scopeCategoryId: CATEGORY,
        displayStatus: 'inactive',
        status: 'inactive',
        adminBlocked: true,
        adminBlockReason: 'Misleading',
      }),
    ]);
    renderWithProviders(<CouponsList status={null} />);
    const table = await screen.findByRole('table', { name: 'Your coupons' });
    const row = (name: string) => within(table).getByRole('link', { name }).closest('tr') as HTMLElement;
    await within(table).findByRole('link', { name: 'SAVE10' });
    expect(within(row('SAVE10')).getByText(/^10 %, up to .*50\.00$/)).toBeDefined();
    expect(within(row('SAVE10')).getByText('All your products')).toBeDefined();
    expect(within(row('SAVE10')).getByText('0 of 100')).toBeDefined();
    expect(within(row('SAVE10')).getByRole('link', { name: 'SAVE10' }).getAttribute('href')).toBe(
      `/coupons/${COUPON.id}`,
    );
    expect(within(row('FIXED25')).getByText(/25\.00 off$/)).toBeDefined();
    expect(await within(row('FIXED25')).findByText('Fashion › Shirts')).toBeDefined();
    expect(within(row('FIXED25')).getByText('0 of unlimited')).toBeDefined();
    expect(within(row('FIXED25')).getByText('Blocked by Nile')).toBeDefined();
    expect(screen.getByRole('link', { name: 'New coupon' }).getAttribute('href')).toBe('/coupons/new');
    expect(queries[0]?.get('sort')).toBe('-createdAt');
    expect(queries[0]?.has('status[eq]')).toBe(false);
  });

  it('the status filter reaches the API; a seller not approved gets no "New coupon"', async () => {
    serveProfile('pending_approval');
    const queries = serveList([]);
    renderWithProviders(<CouponsList status="inactive" />);
    expect(await screen.findByText('No coupons with this status.')).toBeDefined();
    expect(queries[0]?.get('status[eq]')).toBe('inactive');
    expect(screen.queryByRole('link', { name: 'New coupon' })).toBeNull();
  });
});

describe('new coupon (spec 02 SE-22)', { timeout: 20_000 }, () => {
  it('creates with the documented fields and opens the coupon', async () => {
    const created = couponFactory({ code: 'WELCOME' });
    const bodies = serveWrite('post', '/seller/coupons', () => ok(created, 201));
    const view = renderWithToasts(<NewCoupon />);
    await view.user.type(await screen.findByRole('textbox', { name: /^Code/ }), 'welcome');
    await view.user.type(screen.getByRole('textbox', { name: /^Discount \(%\)/ }), '15');
    const ends = screen.getByLabelText(/^Ends/);
    await view.user.type(ends, '2999-01-01T10:00');
    await view.user.click(await enabled('Create coupon'));
    await waitFor(() => {
      expect(bodies).toHaveLength(1);
    });
    expect(bodies[0]).toMatchObject({
      scope: 'seller',
      code: 'WELCOME',
      discountType: 'percent',
      discountValue: '0.1500',
      minItemsSubtotal: '0.00',
      perCustomerLimit: 1,
    });
    expect(bodies[0]).not.toHaveProperty('maxDiscount');
    expect(bodies[0]).not.toHaveProperty('status');
    expect(router.push).toHaveBeenCalledWith(`/coupons/${created.id}`);
  });

  it('COUPON_CODE_TAKEN lands on the code', async () => {
    serveWrite('post', '/seller/coupons', () => fail(409, 'COUPON_CODE_TAKEN'));
    const view = renderWithToasts(<NewCoupon />);
    await view.user.type(await screen.findByRole('textbox', { name: /^Code/ }), 'TAKEN1');
    await view.user.type(screen.getByRole('textbox', { name: /^Discount \(%\)/ }), '10');
    await view.user.type(screen.getByLabelText(/^Ends/), '2999-01-01T10:00');
    await view.user.click(await enabled('Create coupon'));
    expect(await screen.findByText('This code is already used. Choose another.')).toBeDefined();
  });

  it('a seller not approved goes back to the list', async () => {
    serveProfile('suspended');
    renderWithToasts(<NewCoupon />);
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/coupons');
    });
  });
});

describe('coupon page (spec 02 SE-23)', { timeout: 20_000 }, () => {
  it('edit sends only what changed; Save waits for a change', async () => {
    serveCoupon(COUPON);
    const bodies = serveWrite('patch', `/seller/coupons/${COUPON.id}`, () =>
      ok({ ...COUPON, perCustomerLimit: 3, updatedAt: '2026-10-30T09:00:00.000Z' }),
    );
    const view = renderWithToasts(<CouponView couponId={COUPON.id} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'SAVE10' })).toBeDefined();
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(true);
    const perCustomer = screen.getByRole('spinbutton', { name: /^Uses per customer/ });
    await view.user.clear(perCustomer);
    await view.user.type(perCustomer, '3');
    await view.user.click(await enabled('Save'));
    expect(await screen.findByText('Coupon saved.')).toBeDefined();
    expect(bodies).toEqual([{ perCustomerLimit: 3 }]);
  });

  it('after the first use: the note, and only the end, total uses and Active stay editable', async () => {
    serveCoupon({ ...COUPON, redemptionCount: 4 });
    renderWithToasts(<CouponView couponId={COUPON.id} />);
    expect(await screen.findByText('Locked after the first use.')).toBeDefined();
    expect(screen.getByText(/Used 4 times$/)).toBeDefined();
    expect(screen.getByRole('textbox', { name: /^Discount \(%\)/ }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('spinbutton', { name: /^Uses per customer/ }).hasAttribute('disabled')).toBe(
      true,
    );
    expect(screen.getByLabelText(/^Ends/).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('spinbutton', { name: /^Total uses/ }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('switch', { name: 'Active' }).hasAttribute('disabled')).toBe(false);
  });

  it('blocked by Nile: the banner, and Active can’t be turned on', async () => {
    serveCoupon({
      ...COUPON,
      status: 'inactive',
      displayStatus: 'inactive',
      adminBlocked: true,
      adminBlockReason: 'Misleading',
    });
    renderWithToasts(<CouponView couponId={COUPON.id} />);
    expect(await screen.findByText('Nile blocked this coupon: Misleading')).toBeDefined();
    expect(screen.getByRole('switch', { name: 'Active' }).hasAttribute('disabled')).toBe(true);
  });

  it('COUPON_LOCKED: reads the coupon again and explains', async () => {
    const state = serveCoupon(COUPON);
    serveWrite('patch', `/seller/coupons/${COUPON.id}`, () => fail(409, 'COUPON_LOCKED'));
    const view = renderWithToasts(<CouponView couponId={COUPON.id} />);
    const perCustomer = await screen.findByRole('spinbutton', { name: /^Uses per customer/ });
    await view.user.clear(perCustomer);
    await view.user.type(perCustomer, '2');
    await view.user.click(await enabled('Save'));
    expect(
      await screen.findByText(
        'This coupon has been used, so only the end date, total uses and status can change.',
      ),
    ).toBeDefined();
    await waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('COUPON_INVALID: the named fields get their message', async () => {
    serveCoupon(COUPON);
    serveWrite('patch', `/seller/coupons/${COUPON.id}`, () =>
      fail(422, 'COUPON_INVALID', [{ field: 'perCustomerLimit', constraint: 'max', message: 'too many' }]),
    );
    const view = renderWithToasts(<CouponView couponId={COUPON.id} />);
    const perCustomer = await screen.findByRole('spinbutton', { name: /^Uses per customer/ });
    await view.user.clear(perCustomer);
    await view.user.type(perCustomer, '2');
    await view.user.click(await enabled('Save'));
    expect(await screen.findByText('Enter a whole number from 1 to 100.')).toBeDefined();
  });
});
