// @vitest-environment jsdom
import type { ErrorCode, Schema } from '@nile/api';
import { adminListItemFactory, mockApi } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { AdminsView } from './admins-view';

const server = setupMswServer();

const ME = adminListItemFactory({ email: 'me@example.test' });
const ACTIVE = adminListItemFactory({ email: 'ops@example.test' });
const INVITED = adminListItemFactory({
  email: 'new@example.test',
  status: 'invited',
  emailVerifiedAt: null,
  lastLoginAt: null,
});
const SUSPENDED = adminListItemFactory({ email: 'gone@example.test', status: 'suspended' });

/** `GET /admin/admins`: records each query; answers with `rows()` so a test can change them. */
function serveAdmins(initial: Schema<'AdminListItemDto'>[]) {
  const state = { rows: initial, queries: [] as URLSearchParams[] };
  server.use(
    mockApi(
      'get',
      '/admin/admins',
      ({ request, reply }) => {
        state.queries.push(new URL(request.url).searchParams);
        return reply.ok(state.rows, { nextCursor: null, hasMore: false, limit: 20 });
      },
      { base: BFF_BASE },
    ),
  );
  return state;
}

const renderView = (status: string | null = null) =>
  renderWithProviders(
    <>
      <AdminsView status={status} currentUserId={ME.id} />
      <Toaster />
    </>,
  );

type View = ReturnType<typeof renderView>;

/** The table row of `email` (the address also appears in dialogs and toasts). */
const rowOf = async (email: string) => {
  const table = await screen.findByRole('table', { name: 'Admin accounts' });
  const cell = await within(table).findByText(new RegExp(`^${email.replace('.', '\\.')}`));
  const row = cell.closest('tr');
  if (row === null) throw new Error('no row');
  return within(row);
};

describe('admins (spec 03 AD-03)', { timeout: 15_000 }, () => {
  it('rows with status, dates and only the actions their status allows; never "Suspend" on yourself', async () => {
    const state = serveAdmins([ME, ACTIVE, INVITED, SUSPENDED]);
    renderView();
    const me = await rowOf('me@example.test');
    expect(me.getByText('me@example.test (you)')).toBeDefined();
    expect(me.queryByRole('button')).toBeNull();
    const active = await rowOf('ops@example.test');
    expect(active.getByText('Active')).toBeDefined();
    expect(active.getByRole('button', { name: 'Suspend ops@example.test' })).toBeDefined();
    const invited = await rowOf('new@example.test');
    expect(invited.getAllByText('—')).toHaveLength(2);
    expect(invited.getByRole('button', { name: 'Resend invite to new@example.test' })).toBeDefined();
    expect(invited.queryByRole('button', { name: /^Suspend/ })).toBeNull();
    const suspended = await rowOf('gone@example.test');
    expect(suspended.getByRole('button', { name: 'Reactivate gone@example.test' })).toBeDefined();
    expect(Object.fromEntries(state.queries[0] ?? [])).toEqual({ limit: '20', sort: '-createdAt' });
    expect(screen.getByText("Customer accounts and delivery agents can't be suspended here.")).toBeDefined();
  });

  it('status tabs filter with status[eq]; unknown values are "All"', async () => {
    const state = serveAdmins([INVITED]);
    const view = renderView('invited');
    await rowOf('new@example.test');
    expect(state.queries[0]?.get('status[eq]')).toBe('invited');
    expect(screen.getByRole('link', { name: 'Invited' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Suspended' }).getAttribute('href')).toBe(
      '/admins?status=suspended',
    );
    view.unmount();
    const other = serveAdmins([]);
    renderView('banana');
    expect(await screen.findByText('No admins here.')).toBeDefined();
    expect(other.queries[0]?.get('status[eq]')).toBeNull();
  });

  it('invite: trimmed, lower-cased email; success names the address and validity; the list reloads', async () => {
    const state = serveAdmins([ME]);
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/admins',
        async ({ request, reply }) => {
          const body = (await request.json()) as { email: string };
          bodies.push(body);
          state.rows = [ME, { ...INVITED, email: body.email }];
          return reply.created({
            id: INVITED.id,
            email: body.email,
            role: 'admin',
            status: 'invited',
            createdAt: INVITED.createdAt,
          });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView();
    await view.user.click(await screen.findByRole('button', { name: 'Invite admin' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite admin' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Email/ }), '  New@Example.TEST ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(
      await screen.findByText("Invitation sent to new@example.test. It's valid for 72 hours."),
    ).toBeDefined();
    expect(bodies).toEqual([{ email: 'new@example.test' }]);
    expect(await rowOf('new@example.test')).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('invite: EMAIL_ALREADY_REGISTERED on the field, the dialog stays open', async () => {
    serveAdmins([ME]);
    server.use(
      mockApi('post', '/admin/admins', ({ reply }) => reply.error(409, 'EMAIL_ALREADY_REGISTERED'), {
        base: BFF_BASE,
      }),
    );
    const view = renderView();
    await view.user.click(await screen.findByRole('button', { name: 'Invite admin' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite admin' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Email/ }), 'ops@example.test');
    await view.user.click(within(dialog).getByRole('button', { name: 'Send invitation' }));
    expect(await within(dialog).findByText('This email already has an account.')).toBeDefined();
  });

  it('resend invite: asks first ("the previous link stops working"); USER_NOT_INVITED refetches', async () => {
    const state = serveAdmins([INVITED]);
    let calls = 0;
    server.use(
      mockApi(
        'post',
        '/admin/users/{userId}/resend-invite',
        ({ reply }) => {
          calls += 1;
          return calls === 1 ? reply.noContent() : reply.error(409, 'USER_NOT_INVITED');
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView();
    const row = await rowOf('new@example.test');
    await view.user.click(row.getByRole('button', { name: 'Resend invite to new@example.test' }));
    const dialog = screen.getByRole('dialog', { name: 'Resend invite' });
    expect(within(dialog).getByText(/The previous link stops working\./)).toBeDefined();
    await view.user.click(within(dialog).getByRole('button', { name: 'Resend invite' }));
    expect(await screen.findByText('A new invitation was sent to new@example.test.')).toBeDefined();

    await view.user.click(row.getByRole('button', { name: 'Resend invite to new@example.test' }));
    await view.user.click(
      within(screen.getByRole('dialog', { name: 'Resend invite' })).getByRole('button', {
        name: 'Resend invite',
      }),
    );
    expect(await screen.findByText('This account has already accepted its invitation.')).toBeDefined();
    await vi.waitFor(() => {
      expect(state.queries.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('suspend: reason required (3..500, trimmed), sent with the call; the list reloads', async () => {
    const state = serveAdmins([ME, ACTIVE]);
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/users/{userId}/suspend',
        async ({ request, reply }) => {
          bodies.push(await request.json());
          state.rows = [ME, { ...ACTIVE, status: 'suspended' }];
          return reply.ok({ id: ACTIVE.id, email: ACTIVE.email, role: 'admin', status: 'suspended' });
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderView();
    const row = await rowOf('ops@example.test');
    await view.user.click(row.getByRole('button', { name: 'Suspend ops@example.test' }));
    const dialog = screen.getByRole('dialog', { name: 'Suspend admin' });
    expect(
      within(dialog).getByText("ops@example.test will be signed out everywhere and can't sign in."),
    ).toBeDefined();
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), ' x ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await within(dialog).findByText('Must be at least 3 characters.')).toBeDefined();
    expect(bodies).toEqual([]);
    const reason = within(dialog).getByRole('textbox', { name: /^Reason/ });
    await view.user.clear(reason);
    await view.user.type(reason, '  Left the company  ');
    await view.user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText('ops@example.test was suspended.')).toBeDefined();
    expect(bodies).toEqual([{ reason: 'Left the company' }]);
    expect(
      (await rowOf('ops@example.test')).getByRole('button', { name: 'Reactivate ops@example.test' }),
    ).toBeDefined();
  });

  it.each([
    ['CANNOT_SUSPEND_SELF', "You can't suspend your own account."],
    ['USER_INVALID_STATUS_TRANSITION', 'This account changed meanwhile. Here is its current state.'],
  ] as const)('suspend refused with %s: closes, explains, refetches', async (code: ErrorCode, message) => {
    const state = serveAdmins([ACTIVE]);
    server.use(
      mockApi('post', '/admin/users/{userId}/suspend', ({ reply }) => reply.error(409, code), {
        base: BFF_BASE,
      }),
    );
    const view = renderView();
    await view.user.click(
      (await rowOf('ops@example.test')).getByRole('button', { name: 'Suspend ops@example.test' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Suspend admin' });
    await view.user.type(within(dialog).getByRole('textbox', { name: /^Reason/ }), 'Security review');
    await view.user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await screen.findByText(message)).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
    await vi.waitFor(() => {
      expect(state.queries.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('reactivate: one click, then the list reloads', async () => {
    const state = serveAdmins([SUSPENDED]);
    server.use(
      mockApi(
        'post',
        '/admin/users/{userId}/reactivate',
        ({ reply }) => {
          state.rows = [{ ...SUSPENDED, status: 'active' }];
          return reply.ok({ id: SUSPENDED.id, email: SUSPENDED.email, role: 'admin', status: 'active' });
        },
        { base: BFF_BASE },
      ),
    );
    const view: View = renderView();
    await view.user.click(
      (await rowOf('gone@example.test')).getByRole('button', { name: 'Reactivate gone@example.test' }),
    );
    expect(await screen.findByText('gone@example.test can sign in again.')).toBeDefined();
    expect(
      (await rowOf('gone@example.test')).getByRole('button', { name: 'Suspend gone@example.test' }),
    ).toBeDefined();
  });

  it('load failure: error state', async () => {
    server.use(
      mockApi('get', '/admin/admins', ({ reply }) => reply.error(500, 'INTERNAL_ERROR'), { base: BFF_BASE }),
    );
    renderView();
    expect(await screen.findByText("The admin accounts couldn't be loaded.")).toBeDefined();
  });
});
