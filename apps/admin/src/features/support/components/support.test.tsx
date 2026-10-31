// @vitest-environment jsdom
import type { RealtimeMessage, RealtimeMessageType, Schema } from '@nile/api';
import type * as Realtime from '@nile/realtime';
import { adminListItemFactory, adminTicketFactory, mockApi, ticketMessageFactory } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { Toaster } from '@nile/ui';
import { act, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { SupportKeeper } from './support-keeper';
import { TicketDetail } from './ticket-detail';
import { TicketsList } from './tickets-list';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

// The socket has its own tests; here the console's typing line and room.
const realtime = vi.hoisted(() => ({
  handlers: new Map<string, Set<(message: unknown) => void>>(),
  typing: vi.fn(),
}));
vi.mock('@nile/realtime', async (importOriginal) => {
  const { useEffect, useRef } = await import('react');
  return {
    ...(await importOriginal<typeof Realtime>()),
    useRealtimeStatus: () => 'connected',
    useRealtimeConnected: () => true,
    useTicketRoom: () => undefined,
    useTypingSignal: () => realtime.typing,
    useRealtimeMessage: (type: string, handler: (message: unknown) => void) => {
      const latest = useRef(handler);
      useEffect(() => {
        latest.current = handler;
      });
      useEffect(() => {
        const listener = (message: unknown) => {
          latest.current(message);
        };
        const set = realtime.handlers.get(type) ?? new Set();
        set.add(listener);
        realtime.handlers.set(type, set);
        return () => {
          set.delete(listener);
        };
      }, [type]);
    },
  };
});

function emit<T extends RealtimeMessageType>(type: T, data: RealtimeMessage<T>['data']) {
  act(() => {
    for (const handler of realtime.handlers.get(type) ?? []) {
      handler({ type, eventId: crypto.randomUUID(), occurredAt: new Date().toISOString(), data });
    }
  });
}

const server = setupMswServer();

type Ticket = Schema<'AdminTicketSummaryDto'>;

const ME = adminListItemFactory({ email: 'me@example.test' });
const OTHER = adminListItemFactory({ email: 'ops@example.test' });
const TICKET = adminTicketFactory({ subject: 'Parcel late', order: { id: ME.id, orderNumber: 'NM-1001' } });
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

const USER_MESSAGE = ticketMessageFactory({
  sender: { role: 'customer', isMe: false, displayName: 'Mona Ali' },
  body: 'Where is it?',
});
const NOTE = ticketMessageFactory({
  kind: 'internal_note',
  sender: { role: 'admin', isMe: false, displayName: 'ops@example.test' },
  body: 'Courier called.',
});

beforeEach(() => {
  router.push.mockReset();
  realtime.typing.mockReset();
  server.use(
    mockApi('get', '/admin/admins', ({ reply }) => reply.ok([ME, OTHER], { ...PAGE, limit: 100 }), {
      base: BFF_BASE,
    }),
    mockApi('post', '/admin/support/tickets/{ticketId}/read', ({ reply }) => reply.noContent(), {
      base: BFF_BASE,
    }),
  );
});

function serveTicket(initial: Ticket, messages = [NOTE, USER_MESSAGE]) {
  const state = { ticket: initial, reads: 0 };
  server.use(
    mockApi(
      'get',
      '/admin/support/tickets/{ticketId}',
      ({ reply }) => {
        state.reads += 1;
        return reply.ok(state.ticket);
      },
      { base: BFF_BASE },
    ),
    mockApi('get', '/admin/support/tickets/{ticketId}/messages', ({ reply }) => reply.ok(messages, PAGE), {
      base: BFF_BASE,
    }),
  );
  return state;
}

const renderDetail = (ticket: Ticket = TICKET) =>
  renderWithProviders(
    <SupportKeeper>
      <TicketDetail ticketId={ticket.id} currentUserId={ME.id} />
      <Toaster />
    </SupportKeeper>,
  );

describe('tickets (spec 03 AD-28, T-M5)', { timeout: 15_000 }, () => {
  it('opens on "Waiting for support", longest wait first; rows name the opener, status and SLA', async () => {
    const queries: Record<string, string>[] = [];
    const late = adminTicketFactory({ slaBreachedAt: '2026-10-31T10:00:00.000Z' });
    server.use(
      mockApi(
        'get',
        '/admin/support/tickets',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([late], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(<TicketsList params={{}} currentUserId={ME.id} />);
    const table = await screen.findByRole('table', { name: 'Support tickets' });
    expect((await within(table).findByRole('link', { name: late.subject })).getAttribute('href')).toBe(
      `/support/${late.id}`,
    );
    expect(within(table).getByText(`Customer · ${late.opener.email}`)).toBeDefined();
    expect(within(table).getByText('Waiting for support')).toBeDefined();
    expect(within(table).getByText('Unassigned')).toBeDefined();
    expect(within(table).getByText('Past 24 h')).toBeDefined();
    expect(within(table).getByText('Unread')).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      sort: 'awaitingAdminSince',
      'status[in]': 'open,awaiting_admin',
    });
    expect(screen.getByRole('link', { name: 'Waiting for support' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it.each([
    ['mine', { 'assignedAdminId[eq]': ME.id, 'status[in]': 'open,awaiting_admin,awaiting_user,resolved' }],
    ['unassigned', { 'assigned[eq]': 'false', 'status[in]': 'open,awaiting_admin' }],
    ['sla', { 'slaBreached[eq]': 'true' }],
    ['closed', { 'status[eq]': 'closed' }],
  ] as const)('view %s sends its query with the filters', async (view, expected) => {
    const queries: Record<string, string>[] = [];
    server.use(
      mockApi(
        'get',
        '/admin/support/tickets',
        ({ request, reply }) => {
          queries.push(Object.fromEntries(new URL(request.url).searchParams));
          return reply.ok([], PAGE);
        },
        { base: BFF_BASE },
      ),
    );
    renderWithProviders(
      <TicketsList params={{ view, category: 'return', opener: 'seller' }} currentUserId={ME.id} />,
    );
    expect(await screen.findByText('No tickets match these filters.')).toBeDefined();
    expect(queries[0]).toEqual({
      limit: '20',
      sort: '-lastMessageAt',
      'category[eq]': 'return',
      'openerRole[eq]': 'seller',
      ...expected,
    });
  });
});

describe('ticket (spec 03 AD-29, T-M5)', { timeout: 20_000 }, () => {
  it('header details; the thread shows internal notes labelled; the user typing is named', async () => {
    serveTicket(TICKET);
    renderDetail();
    expect(await screen.findByRole('heading', { level: 1, name: 'Parcel late' })).toBeDefined();
    const details = screen.getByLabelText('Ticket details');
    expect(within(details).getByText(`Mona Ali · Customer · ${TICKET.opener.email}`)).toBeDefined();
    expect(within(details).getByText('Unassigned')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Order NM-1001' }).getAttribute('href')).toBe(`/orders/${ME.id}`);
    expect(screen.getByText(/^Waiting since /)).toBeDefined();
    expect(await screen.findByText('Courier called.')).toBeDefined();
    expect(screen.getByText('Internal note · ops@example.test')).toBeDefined();
    expect(screen.getByText('Where is it?')).toBeDefined();
    emit('support.typing', { ticketId: TICKET.id, userId: 'u', role: 'customer' });
    expect(screen.getByText('Mona Ali is typing…')).toBeDefined();
  });

  it('a reply goes to the user (no "internal"), a note is internal and sends no typing signal', async () => {
    serveTicket(TICKET);
    const bodies: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/support/tickets/{ticketId}/messages',
        async ({ request, reply }) => {
          const body = (await request.json()) as { body: string; internal?: boolean };
          bodies.push(body);
          return reply.created(
            ticketMessageFactory({
              kind: body.internal === true ? 'internal_note' : 'message',
              sender: { role: 'admin', isMe: true, displayName: 'me@example.test' },
              body: body.body,
            }),
          );
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    expect(await screen.findByText('Replying assigns this ticket to you.')).toBeDefined();
    await view.user.type(await screen.findByRole('textbox', { name: /^Reply to the user/ }), 'On its way');
    await view.user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('On its way')).toBeDefined();
    expect(realtime.typing).toHaveBeenCalled();
    realtime.typing.mockReset();

    await view.user.click(screen.getByRole('tab', { name: 'Internal note' }));
    expect(screen.getByRole('tab', { name: 'Internal note' }).getAttribute('aria-selected')).toBe('true');
    await view.user.type(screen.getByRole('textbox', { name: /^Internal note/ }), 'Refund if lost');
    await view.user.click(screen.getByRole('button', { name: 'Add note' }));
    expect(await screen.findByText('Refund if lost')).toBeDefined();
    expect(realtime.typing).not.toHaveBeenCalled();
    expect(bodies).toEqual([{ body: 'On its way' }, { body: 'Refund if lost', internal: true }]);
  });

  it('a failed reply, then the note tab and back: sending the same reply reuses the key (T-O1 F-1, F-3)', async () => {
    serveTicket(TICKET);
    const sent: { body: unknown; key: string | null }[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/support/tickets/{ticketId}/messages',
        async ({ request, reply }) => {
          const body = (await request.json()) as { body: string };
          sent.push({ body, key: request.headers.get('Idempotency-Key') });
          if (sent.length === 1) return reply.error(503, 'SERVICE_UNAVAILABLE');
          return reply.created(
            ticketMessageFactory({
              sender: { role: 'admin', isMe: true, displayName: 'me@example.test' },
              body: body.body,
            }),
          );
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.type(await screen.findByRole('textbox', { name: /^Reply to the user/ }), 'On its way');
    await view.user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText("Your message wasn't sent.")).toBeDefined();
    await view.user.click(screen.getByRole('tab', { name: 'Internal note' }));
    await view.user.click(screen.getByRole('tab', { name: 'Reply' }));
    const box = screen.getByRole('textbox', { name: /^Reply to the user/ });
    if ((box as HTMLTextAreaElement).value === '') await view.user.type(box, 'On its way');
    const again =
      screen.queryByRole('button', { name: 'Retry' }) ?? screen.getByRole('button', { name: 'Send' });
    await view.user.click(again);
    expect(await screen.findByText('On its way', { selector: 'p' })).toBeDefined();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.key).toBe(sent[0]?.key);
  });

  it('assign to me, then unassign; the answer replaces the ticket', async () => {
    const state = serveTicket(TICKET);
    const sent: unknown[] = [];
    server.use(
      mockApi(
        'post',
        '/admin/support/tickets/{ticketId}/assign',
        async ({ request, reply }) => {
          const body = (await request.json()) as { adminUserId: string | null };
          sent.push(body);
          state.ticket = {
            ...TICKET,
            assignedAdmin: body.adminUserId === null ? null : { userId: body.adminUserId, displayName: 'Me' },
          };
          return reply.ok(state.ticket);
        },
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Assign to me' }));
    expect(await screen.findByText('Me (you)')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Assign to me' })).toBeNull();
    await view.user.click(screen.getByRole('button', { name: 'Unassign' }));
    expect(await screen.findByText('The ticket is unassigned.')).toBeDefined();
    expect(sent).toEqual([{ adminUserId: ME.id }, { adminUserId: null }]);
  });

  it('"Assign…" offers active admins; SUPPORT_ASSIGNEE_INVALID explains', async () => {
    serveTicket(TICKET);
    server.use(
      mockApi(
        'post',
        '/admin/support/tickets/{ticketId}/assign',
        ({ reply }) => reply.error(422, 'SUPPORT_ASSIGNEE_INVALID'),
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Assign…' }));
    const dialog = screen.getByRole('dialog', { name: 'Assign ticket' });
    await view.user.click(within(dialog).getByRole('combobox', { name: 'Admin' }));
    await view.user.click(await screen.findByRole('option', { name: 'ops@example.test' }));
    await view.user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(
      await screen.findByText("That admin can't take tickets any more. The list of admins was reloaded."),
    ).toBeDefined();
  });

  it('resolve; close after confirming; a stale refusal reads the ticket again', async () => {
    const state = serveTicket(TICKET);
    server.use(
      mockApi(
        'post',
        '/admin/support/tickets/{ticketId}/resolve',
        ({ reply }) => {
          state.ticket = { ...TICKET, status: 'resolved' };
          return reply.ok(state.ticket);
        },
        { base: BFF_BASE },
      ),
      mockApi(
        'post',
        '/admin/support/tickets/{ticketId}/close',
        ({ reply }) => reply.error(409, 'SUPPORT_TICKET_INVALID_STATUS_TRANSITION'),
        { base: BFF_BASE },
      ),
    );
    const view = renderDetail();
    await view.user.click(await screen.findByRole('button', { name: 'Resolve' }));
    expect(await screen.findByText('Marked as resolved.')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Resolve' })).toBeNull();
    const actions = screen.getByRole('group', { name: 'Ticket actions' });
    await view.user.click(within(actions).getByRole('button', { name: 'Close' }));
    const dialog = screen.getByRole('dialog', { name: 'Close ticket' });
    expect(
      within(dialog).getByText("Close this ticket? The user can't reply and must open a new one."),
    ).toBeDefined();
    const reads = state.reads;
    await view.user.click(within(dialog).getByRole('button', { name: 'Close ticket' }));
    expect(
      await screen.findByText('This ticket changed meanwhile. Here is its current state.'),
    ).toBeDefined();
    await vi.waitFor(() => {
      expect(state.reads).toBeGreaterThan(reads);
    });
  });

  it('a closed ticket takes internal notes only, without actions', async () => {
    serveTicket({ ...TICKET, status: 'closed', awaitingAdminSince: null });
    renderDetail();
    expect(
      await screen.findByText(
        'This ticket is closed: the user can no longer reply. Internal notes can still be added.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('tab', { name: 'Reply' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Ticket actions' })).toBeNull();
  });

  it('an unknown ticket is "not found"', async () => {
    server.use(
      mockApi(
        'get',
        '/admin/support/tickets/{ticketId}',
        ({ reply }) => reply.error(404, 'SUPPORT_TICKET_NOT_FOUND'),
        { base: BFF_BASE },
      ),
    );
    renderDetail();
    expect(await screen.findByText("This ticket doesn't exist.")).toBeDefined();
    expect(screen.getByRole('link', { name: 'Back to tickets' }).getAttribute('href')).toBe('/support');
  });
});
