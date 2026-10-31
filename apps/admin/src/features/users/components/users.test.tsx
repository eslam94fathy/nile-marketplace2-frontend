// @vitest-environment jsdom
import type { Schema } from '@nile/api';
import { adminUserFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { UsersList } from './users-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const server = setupMswServer();

const ME = adminUserFactory({ email: 'me@example.test', role: 'admin' });
const CUSTOMER = adminUserFactory({ email: 'mona@example.test' });
const SUSPENDED = adminUserFactory({ email: 'gone@example.test', status: 'suspended' });
const UNVERIFIED = adminUserFactory({
  email: 'new@example.test',
  status: 'pending_email_verification',
  emailVerifiedAt: null,
  lastLoginAt: null,
});
const INVITED_AGENT = adminUserFactory({
  email: 'agent@example.test',
  role: 'delivery_agent',
  status: 'invited',
  emailVerifiedAt: null,
  lastLoginAt: null,
});
const SELLER = adminUserFactory({ email: 'shop@example.test', role: 'seller' });
const ADMIN = adminUserFactory({ email: 'ops@example.test', role: 'admin' });

beforeEach(() => {
  router.push.mockReset();
  router.replace.mockReset();
});

/** `GET /admin/users`: records each query; answers with `rows` so a test can change them. */
function serveUsers(initial: Schema<'AdminUserListItemDto'>[]) {
  const state = { rows: initial, queries: [] as URLSearchParams[] };
  server.use(
    mockApi(
      'get',
      '/admin/users',
      ({ request, reply }) => {
        state.queries.push(new URL(request.url).searchParams);
        return reply.ok(state.rows, { nextCursor: null, hasMore: false, limit: 20 });
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

const renderList = (params: Record<string, string> = {}) =>
  renderWithProviders(
    <>
      <UsersList params={params} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

const rowOf = async (email: string) => {
  const table = await screen.findByRole('table', { name: 'User accounts' });
  const cell = await within(table).findByText(new RegExp(`^${email.replace('.', '\\.')}`));
  const row = cell.closest('tr');
  if (row === null) throw new Error('no row');
  return within(row);
};

describe('users (spec 03 AD-24, T-M2)', { timeout: 15_000 }, () => {
  it('rows show role and status; actions only where AD-Q-10 allows them, none on your own row', async () => {
    serveUsers([ME, CUSTOMER, SUSPENDED, UNVERIFIED, INVITED_AGENT, SELLER, ADMIN]);
    renderList();
    const me = await rowOf('me@example.test');
    expect(me.getByText('me@example.test (you)')).toBeDefined();
    expect(me.queryByRole('button')).toBeNull();
    const customer = await rowOf('mona@example.test');
    expect(customer.getByText('Customer')).toBeDefined();
    expect(customer.getByRole('button', { name: 'Suspend mona@example.test' })).toBeDefined();
    expect(
      (await rowOf('gone@example.test')).getByRole('button', { name: 'Reactivate gone@example.test' }),
    ).toBeDefined();
    expect((await rowOf('new@example.test')).queryByRole('button')).toBeNull();
    const agent = await rowOf('agent@example.test');
    expect(agent.getByText('Agent')).toBeDefined();
    expect(agent.getByRole('button', { name: 'Resend invite to agent@example.test' })).toBeDefined();
    // Sellers and admins are managed on their own screens.
    expect((await rowOf('shop@example.test')).queryByRole('button')).toBeNull();
    expect((await rowOf('ops@example.test')).queryByRole('button')).toBeNull();
  });

  it('URL filters are sent with literal keys; a select change navigates', async () => {
    const state = serveUsers([INVITED_AGENT]);
    const view = renderList({ role: 'delivery_agent', status: 'invited', email: 'agent' });
    await rowOf('agent@example.test');
    expect(Object.fromEntries(state.queries[0] ?? [])).toEqual({
      limit: '20',
      sort: '-createdAt',
      'role[eq]': 'delivery_agent',
      'status[eq]': 'invited',
      'email[like]': 'agent',
    });
    await view.user.click(screen.getByRole('combobox', { name: 'Role' }));
    await view.user.click(await screen.findByRole('option', { name: 'All roles' }));
    expect(router.push).toHaveBeenCalledWith('/users?status=invited&email=agent');
  });

  it('the email filter waits for a pause in typing, then replaces the URL', async () => {
    serveUsers([CUSTOMER]);
    const view = renderList();
    await rowOf('mona@example.test');
    await view.user.type(screen.getByRole('searchbox', { name: 'Email starts with' }), 'mo');
    expect(router.replace).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/users?email=mo');
    });
  });

  it('suspend a customer: reason required, the customer wording, the list reloads', async () => {
    const state = serveUsers([CUSTOMER]);
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/users/{userId}/suspend',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          state.rows = [{ ...CUSTOMER, status: 'suspended' }];
          return reply.ok({ id: CUSTOMER.id, email: CUSTOMER.email, role: 'customer', status: 'suspended' });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderList();
    await view.user.click(
      (await rowOf('mona@example.test')).getByRole('button', { name: 'Suspend mona@example.test' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Suspend customer' });
    expect(within(dialog).getByText("They are signed out everywhere and can't sign in.")).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await within(dialog).findByText(/at least 3 characters/)).toBeDefined();
    expect(bodies).toEqual([]);
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), ' Fraud reports ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('mona@example.test was suspended.')).toBeDefined();
    expect(bodies).toEqual([{ reason: 'Fraud reports' }]);
    expect(
      (await rowOf('mona@example.test')).getByRole('button', { name: 'Reactivate mona@example.test' }),
    ).toBeDefined();
  });

  it('a status changed meanwhile: explains and reloads', async () => {
    const state = serveUsers([SUSPENDED]);
    server.use(
      mockApi(
        'post',
        '/admin/users/{userId}/reactivate',
        ({ reply }) => reply.error(409, 'USER_INVALID_STATUS_TRANSITION'),
        { base: BFF_BASE },
      ),
    );
    const view = renderList();
    await view.user.click(
      (await rowOf('gone@example.test')).getByRole('button', { name: 'Reactivate gone@example.test' }),
    );
    expect(
      await screen.findByText('This account changed meanwhile. Here is its current state.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(state.queries.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('resend an agent invite after confirming', async () => {
    serveUsers([INVITED_AGENT]);
    let calls = 0;
    server.use(
      mockApi(
        'post',
        '/admin/users/{userId}/resend-invite',
        ({ reply }) => {
          calls += 1;
          return reply.noContent();
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderList();
    await view.user.click(
      (await rowOf('agent@example.test')).getByRole('button', {
        name: 'Resend invite to agent@example.test',
      }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Resend invite' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Resend invite' }));
    expect(await screen.findByText('A new invitation was sent to agent@example.test.')).toBeDefined();
    expect(calls).toBe(1);
  });

  it('empty with filters offers "Clear filters"; a load failure offers a retry', async () => {
    serveUsers([]);
    renderList({ role: 'seller' });
    expect(await screen.findByText('No users match these filters.')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Clear filters' }).getAttribute('href')).toBe('/users');
    server.use(
      mockApi('get', '/admin/users', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderList({ role: 'admin' });
    expect(await screen.findByText("The users couldn't be loaded.")).toBeDefined();
  });
});
