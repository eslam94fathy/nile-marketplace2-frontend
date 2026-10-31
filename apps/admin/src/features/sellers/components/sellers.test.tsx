// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import {
  adminListItemFactory,
  adminSellerDetailFactory,
  fixtureId,
  governorateFactory,
  mockApi,
} from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { SellerDetail } from './seller-detail';
import { SellersList } from './sellers-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

type Detail = Schema<'AdminSellerDetailDto'>;

const GIZA = governorateFactory({ id: fixtureId(9700), name: 'Giza' });
const ME = adminListItemFactory({ email: 'me@example.test' });
const OTHER_ADMIN = adminListItemFactory({ email: 'ops@example.test' });
const SELLER = adminSellerDetailFactory({ businessName: 'Nile Crafts' });

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
  server.use(
    mockApi('get', '/admin/governorates', ({ reply }) => reply.ok([GIZA]), { base: BFF_BASE }),
    mockApi(
      'get',
      '/admin/admins',
      ({ reply }) => reply.ok([ME, OTHER_ADMIN], { nextCursor: null, hasMore: false, limit: 100 }),
      {
        base: BFF_BASE,
      },
    ),
  );
});

function serveSeller(seller: Detail) {
  const state = { seller, calls: 0 };
  server.use(
    // AD-05 "Products in the store" (T-M4): the public listing, covered in products.test.tsx.
    mockApi(
      'get',
      '/products',
      ({ reply }) => reply.ok([], { nextCursor: null, hasMore: false, limit: 12 }),
      {
        base: BFF_BASE,
      },
    ),
    mockApi(
      'get',
      '/admin/sellers/{sellerId}',
      ({ reply }) => {
        state.calls += 1;
        return reply.ok(state.seller);
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

type Answer = Detail | { readonly status: number; readonly code: ErrorCode };

function serveDecision(
  path:
    | '/admin/sellers/{sellerId}/approve'
    | '/admin/sellers/{sellerId}/reject'
    | '/admin/sellers/{sellerId}/suspend'
    | '/admin/sellers/{sellerId}/reinstate',
  answer: Answer,
) {
  const bodies: unknown[] = [];
  server.use(
    mockApi(
      'post',
      path,
      async ({ request, reply }) => {
        const text = await request.text();
        bodies.push(text === '' ? undefined : JSON.parse(text));
        return 'code' in answer ? reply.error(answer.status, answer.code) : reply.ok(answer);
      },
      { base: BFF_BASE },
    ),
  );
  return bodies;
}

const renderDetail = (seller: Detail = SELLER) =>
  renderWithProviders(
    <>
      <SellerDetail sellerId={seller.id} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

const heading = (name = 'Nile Crafts') => screen.findByRole('heading', { level: 1, name }, { timeout: 5000 });

describe('sellers list (spec 03 AD-04)', { timeout: 15_000 }, () => {
  it('opens on Pending (oldest first); rows show governorate name and commission %', async () => {
    const queries: URLSearchParams[] = [];
    server.use(
      mockApi(
        'get',
        '/admin/sellers',
        ({ request, reply }) => {
          queries.push(new URL(request.url).searchParams);
          return reply.ok([{ ...SELLER, commissionRate: '0.1250' }], {
            nextCursor: null,
            hasMore: false,
            limit: 20,
          });
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<SellersList params={{}} />);
    const table = await screen.findByRole('table', { name: 'Sellers' });
    const link = await within(table).findByRole('link', { name: 'Nile Crafts' });
    expect(link.getAttribute('href')).toBe(`/sellers/${SELLER.id}`);
    expect(await within(table).findByText('Giza')).toBeDefined();
    expect(within(table).getByText('12.5%')).toBeDefined();
    expect(Object.fromEntries(queries[0] ?? [])).toEqual({
      limit: '20',
      sort: 'createdAt',
      'status[eq]': 'pending_approval',
    });
    expect(screen.getByRole('link', { name: 'Pending' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'All' }).getAttribute('href')).toBe('/sellers?status=all');
  });

  it('date inputs replace the URL with Cairo days', async () => {
    server.use(
      mockApi(
        'get',
        '/admin/sellers',
        ({ reply }) => reply.ok([], { nextCursor: null, hasMore: false, limit: 20 }),
        {
          base: BFF_BASE,
        },
      ),
    );
    const view = renderWithProviders(<SellersList params={{ status: 'all' }} />);
    await screen.findByText('No sellers here.');
    const from = screen.getByLabelText('Created from');
    await view.user.type(from, '2026-07-01');
    expect(router.replace).toHaveBeenLastCalledWith('/sellers?status=all&from=2026-07-01');
  });

  it('load failure: error state', async () => {
    server.use(
      mockApi('get', '/admin/sellers', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderWithProviders(<SellersList params={{}} />);
    expect(await screen.findByText("The sellers couldn't be loaded.")).toBeDefined();
  });
});

describe('seller page (spec 03 AD-05)', { timeout: 20_000 }, () => {
  it.each(['SELLER_NOT_FOUND', 'VALIDATION_FAILED'] as const)('%s: not found', async (code) => {
    server.use(
      mockApi(
        'get',
        '/admin/sellers/{sellerId}',
        ({ reply }) => reply.error(code === 'VALIDATION_FAILED' ? 400 : 404, code),
        {
          base: BFF_BASE,
        },
      ),
    );
    renderDetail();
    expect(await screen.findByText("This seller doesn't exist.")).toBeDefined();
  });

  it('details, links and histories; actors as "you", an admin email, Seller', async () => {
    serveSeller({
      ...SELLER,
      status: 'approved',
      approvedAt: '2026-10-15T09:00:00.000Z',
      statusHistory: [
        {
          fromStatus: 'rejected',
          toStatus: 'pending_approval',
          reason: null,
          actorUserId: fixtureId(9999),
          createdAt: '2026-10-15T08:00:00.000Z',
        },
        {
          fromStatus: 'pending_approval',
          toStatus: 'approved',
          reason: null,
          actorUserId: ME.id,
          createdAt: '2026-10-15T09:00:00.000Z',
        },
      ],
      commissionHistory: [
        {
          oldRate: '0.1000',
          newRate: '0.1250',
          changedByUserId: OTHER_ADMIN.id,
          createdAt: '2026-10-15T10:00:00.000Z',
        },
      ],
    });
    renderDetail();
    await heading();
    expect(screen.getByText('Email verified')).toBeDefined();
    expect(await screen.findByText('12 26th of July St, Zamalek, Cairo, Giza')).toBeDefined();
    expect(screen.getByRole('link', { name: 'View in the store' }).getAttribute('href')).toBe(
      `http://store.test/search?seller=${SELLER.id}`,
    );
    expect(screen.getByRole('link', { name: 'Finance account' }).getAttribute('href')).toBe(
      `/finance/accounts?owner=${SELLER.id}&type=seller_payable`,
    );
    const status = screen.getByRole('table', { name: 'Status changes, newest first' });
    expect(within(status).getByText('Rejected → Waiting for approval')).toBeDefined();
    expect(within(status).getByText('Seller')).toBeDefined();
    expect(within(status).getByText('you')).toBeDefined();
    const commission = screen.getByRole('table', { name: 'Commission changes, newest first' });
    expect(within(commission).getByText('10% → 12.5%')).toBeDefined();
    expect(await within(commission).findByText('ops@example.test')).toBeDefined();
  });

  it('pending, email not verified: Approve disabled with the reason; Reject offered', async () => {
    serveSeller({ ...SELLER, emailVerified: false });
    renderDetail();
    await heading();
    expect(screen.getByText('Email not verified')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveProperty('disabled', true);
    expect(screen.getAllByText("The seller hasn't verified their email yet.").length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveProperty('disabled', false);
    expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
  });

  it.each([
    ['approved', ['Suspend']],
    ['suspended', ['Reinstate']],
    ['rejected', []],
  ] as const)('%s: only %j', async (status, buttons) => {
    serveSeller({ ...SELLER, status });
    renderDetail();
    await heading();
    for (const name of ['Approve', 'Reject', 'Suspend', 'Reinstate']) {
      expect(screen.queryByRole('button', { name }) !== null).toBe(
        (buttons as readonly string[]).includes(name),
      );
    }
  });

  it('Approve asks first; the answer replaces the seller', async () => {
    serveSeller(SELLER);
    const bodies = serveDecision('/admin/sellers/{sellerId}/approve', {
      ...SELLER,
      status: 'approved',
      approvedAt: '2026-10-15T12:00:00.000Z',
    });
    const view = renderDetail();
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = screen.getByRole('dialog', { name: 'Approve' });
    expect(within(dialog).getByText('Approve Nile Crafts? They can start selling.')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Nile Crafts is approved.')).toBeDefined();
    expect(bodies).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Suspend' })).toBeDefined();
  });

  it('SELLER_EMAIL_NOT_VERIFIED on approve: refetched and explained', async () => {
    const state = serveSeller(SELLER);
    serveDecision('/admin/sellers/{sellerId}/approve', { status: 409, code: 'SELLER_EMAIL_NOT_VERIFIED' });
    const view = renderDetail();
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Approve' }));
    await view.user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Approve' }));
    expect(
      (await screen.findAllByText("The seller hasn't verified their email yet.")).length,
    ).toBeGreaterThan(0);
    await vi.waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('Reject needs a reason (3..500, trimmed)', async () => {
    serveSeller(SELLER);
    const bodies = serveDecision('/admin/sellers/{sellerId}/reject', {
      ...SELLER,
      status: 'rejected',
      rejectionReason: 'Missing documents',
    });
    const view = renderDetail();
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Reject' }));
    const dialog = screen.getByRole('dialog', { name: 'Reject' });
    expect(within(dialog).getByText('The seller sees this reason and can re-apply.')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await within(dialog).findByText('Must be at least 3 characters.')).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), '  Missing documents ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(await screen.findByText('Nile Crafts was rejected.')).toBeDefined();
    expect(bodies).toEqual([{ reason: 'Missing documents' }]);
    expect(await screen.findByText('Missing documents')).toBeDefined();
  });

  it('Reinstate: the reason is optional and omitted when empty', async () => {
    const suspended = { ...SELLER, status: 'suspended' as const };
    serveSeller(suspended);
    const bodies = serveDecision('/admin/sellers/{sellerId}/reinstate', { ...SELLER, status: 'approved' });
    const view = renderDetail(suspended);
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Reinstate' }));
    const dialog = screen.getByRole('dialog', { name: 'Reinstate' });
    expect(within(dialog).getByText('Their products become visible again.')).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Reinstate' }));
    expect(await screen.findByText('Nile Crafts is reinstated.')).toBeDefined();
    expect(bodies).toEqual([{}]);
  });

  it('SELLER_INVALID_STATUS_TRANSITION: closes, refetches, explains', async () => {
    const approved = { ...SELLER, status: 'approved' as const };
    const state = serveSeller(approved);
    serveDecision('/admin/sellers/{sellerId}/suspend', {
      status: 409,
      code: 'SELLER_INVALID_STATUS_TRANSITION',
    });
    const view = renderDetail(approved);
    await heading();
    await view.user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend' });
    expect(
      within(dialog).getByText('Their products are hidden from the store at once. Open orders continue.'),
    ).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Policy breach');
    await view.user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(
      await screen.findByText('This seller changed meanwhile. Here is their current state.'),
    ).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    await vi.waitFor(() => {
      expect(state.calls).toBe(2);
    });
  });

  it('commission: percent in, fraction out (12.5 → "0.1250"); unchanged rate on the field', async () => {
    serveSeller(SELLER);
    const bodies: unknown[] = [];
    let calls = 0;
    server.use(
      mockApi(
        'put',
        '/admin/sellers/{sellerId}/commission-rate',
        async ({ request, reply }) => {
          calls += 1;
          bodies.push(await request.json());
          return calls === 1
            ? reply.ok({ ...SELLER, commissionRate: '0.1250' })
            : reply.error(409, 'COMMISSION_RATE_UNCHANGED');
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await heading();
    const rate = screen.getByRole('textbox', { name: /^Commission rate/ });
    expect(rate).toHaveProperty('value', '10');
    expect(screen.getByText('Applies to new orders only.')).toBeDefined();
    await view.user.clear(rate);
    await view.user.type(rate, '12.5');
    await view.user.click(screen.getByRole('button', { name: 'Save rate' }));
    expect(await screen.findByText('Commission set to 12.5%.')).toBeDefined();
    expect(bodies).toEqual([{ commissionRate: '0.1250' }]);
    await view.user.click(screen.getByRole('button', { name: 'Save rate' }));
    expect(await screen.findByText("This is already the seller's rate.")).toBeDefined();
  });

  it('commission: over 100 or 3 decimals is refused before sending', async () => {
    serveSeller(SELLER);
    const view = renderDetail();
    await heading();
    const rate = screen.getByRole('textbox', { name: /^Commission rate/ });
    await view.user.clear(rate);
    await view.user.type(rate, '12.345');
    await view.user.click(screen.getByRole('button', { name: 'Save rate' }));
    expect(await screen.findByText('Enter a percentage from 0 to 100 with up to 2 decimals.')).toBeDefined();
  });
});
