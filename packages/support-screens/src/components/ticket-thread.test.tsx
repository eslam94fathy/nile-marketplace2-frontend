// @vitest-environment jsdom
import type { RealtimeMessage, RealtimeMessageType } from '@nile/api';
import type * as Realtime from '@nile/realtime';
import { mockApi, ticketFactory, ticketMessageFactory } from '@nile/test-utils';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostMessageBody, Ticket, TicketMessage } from '../api';
import { SupportScreensProvider } from '../config';
import { makeConfig, renderSupport, setupMswServer } from '../test/harness';
import { TicketThread, TYPING_VISIBLE_MS } from './ticket-thread';

/** The first render of a file also loads its modules: more time than the 1 s default on a busy machine. */
const FIRST_RENDER = { timeout: 5000 };

// The socket has its own tests in @nile/realtime; here the thread's handlers, room and typing signal.
const realtime = vi.hoisted<{
  status: Realtime.RealtimeStatus;
  handlers: Map<string, Set<(message: unknown) => void>>;
  room: ReturnType<typeof vi.fn<(ticketId: string | null) => void>>;
  typing: ReturnType<typeof vi.fn<() => void>>;
}>(() => ({
  status: 'connected',
  handlers: new Map<string, Set<(message: unknown) => void>>(),
  room: vi.fn(),
  typing: vi.fn(),
}));
vi.mock('@nile/realtime', async (importOriginal) => {
  const { useEffect, useRef } = await import('react');
  return {
    ...(await importOriginal<typeof Realtime>()),
    useRealtimeStatus: () => realtime.status,
    useRealtimeConnected: () => realtime.status === 'connected',
    useTicketRoom: (ticketId: string | null) => {
      realtime.room(ticketId);
    },
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

const TICKET = ticketFactory({
  id: 't-1',
  subject: 'Parcel late',
  ticketNumber: 'T-000000042',
  order: { id: 'o-1', orderNumber: '2026-000123' },
});
const SUPPORT = { role: 'admin' as const, isMe: false, displayName: 'Nile Support' };
const PAGE = { nextCursor: null, hasMore: false, limit: 20 };

interface Backend {
  ticket: Ticket;
  /** Newest first, as the API pages them. */
  messages: TicketMessage[];
  reads: number;
  sent: { body: PostMessageBody; key: string | null }[];
  answer: 'ok' | 'fail' | 'closed';
}

function backend(overrides: Partial<Backend> = {}): Backend {
  const state: Backend = {
    ticket: TICKET,
    messages: [
      ticketMessageFactory({ id: 'm-3', body: 'We are checking.', sender: SUPPORT }),
      ticketMessageFactory({ id: 'm-2', kind: 'system', body: 'Assigned to Nile Support', sender: SUPPORT }),
      ticketMessageFactory({ id: 'm-1', body: 'Where is my parcel?' }),
    ],
    reads: 0,
    sent: [],
    answer: 'ok',
    ...overrides,
  };
  server.use(
    mockApi('get', '/support/tickets/{ticketId}', ({ reply }) => reply.ok(state.ticket)),
    mockApi('get', '/support/tickets/{ticketId}/messages', ({ reply }) => reply.ok(state.messages, PAGE)),
    mockApi('post', '/support/tickets/{ticketId}/read', ({ reply }) => {
      state.reads += 1;
      return reply.noContent();
    }),
    mockApi('get', '/support/tickets', ({ reply }) => reply.ok([state.ticket], PAGE)),
    mockApi('post', '/support/tickets/{ticketId}/messages', async ({ request, reply }) => {
      const body = (await request.json()) as PostMessageBody;
      state.sent.push({ body, key: request.headers.get('Idempotency-Key') });
      if (state.answer === 'fail') return reply.error(500, 'INTERNAL_ERROR');
      if (state.answer === 'closed') {
        state.ticket = { ...state.ticket, status: 'closed' };
        return reply.error(409, 'SUPPORT_TICKET_CLOSED');
      }
      const message = ticketMessageFactory({ id: `sent-${state.sent.length}`, body: body.body });
      state.messages = [message, ...state.messages];
      return reply.created(message);
    }),
  );
  return state;
}

const bodies = () =>
  within(screen.getByRole('region', { name: 'Messages' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent);

beforeEach(() => {
  realtime.status = 'connected';
  realtime.handlers.clear();
  realtime.room.mockReset();
  realtime.typing.mockReset();
});

describe('TicketThread (spec 01 SF-31, spec 00 §12.7)', () => {
  it('header, oldest message first, "You" and "Nile Support", joins the room and marks the ticket read', async () => {
    const state = backend();
    renderSupport(<TicketThread ticketId="t-1" />);

    expect(await screen.findByRole('heading', { name: 'Parcel late' }, FIRST_RENDER)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Order 2026-000123' }).getAttribute('href')).toBe('/orders/o-1');
    expect(screen.getByText('Waiting for support')).toBeDefined();
    await screen.findByText('We are checking.');
    const items = bodies();
    expect(items[0]).toContain('You');
    expect(items[0]).toContain('Where is my parcel?');
    expect(items[1]).toContain('Assigned to Nile Support');
    expect(items[2]).toContain('Nile Support');
    expect(items[2]).toContain('We are checking.');
    expect(realtime.room).toHaveBeenCalledWith('t-1');
    await waitFor(() => {
      expect(state.reads).toBe(1);
    });
  });

  it('an internal note is never shown', async () => {
    backend({
      messages: [
        ticketMessageFactory({ id: 'n-1', kind: 'internal_note', body: 'Staff only', sender: SUPPORT }),
        ticketMessageFactory({ id: 'm-1', body: 'Hello' }),
      ],
    });
    renderSupport(<TicketThread ticketId="t-1" />);
    await screen.findByText('Hello', undefined, FIRST_RENDER);
    expect(screen.queryByText('Staff only')).toBeNull();
  });

  it('send: one key, the message appears, the box empties; Ctrl+Enter sends too', async () => {
    const state = backend();
    const view = renderSupport(<TicketThread ticketId="t-1" />);
    const box = await screen.findByRole('textbox', { name: /^Your message/ }, FIRST_RENDER);

    await view.user.type(box, 'Thanks{Control>}{Enter}{/Control}');
    expect(await screen.findByText('Thanks')).toBeDefined();
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0]?.body).toEqual({ body: 'Thanks' });
    expect(state.sent[0]?.key).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => {
      expect((box as HTMLTextAreaElement).value).toBe('');
    });
    expect(realtime.typing).toHaveBeenCalled();

    // Enter alone adds a line.
    await view.user.type(box, 'Line one{Enter}Line two');
    expect((box as HTMLTextAreaElement).value).toBe('Line one\nLine two');
    expect(state.sent).toHaveLength(1);
  });

  it('a failed send keeps the text and "Retry" sends the same intent with the same key', async () => {
    const state = backend({ answer: 'fail' });
    const view = renderSupport(<TicketThread ticketId="t-1" />);
    const box = await screen.findByRole('textbox', { name: /^Your message/ }, FIRST_RENDER);
    await view.user.type(box, 'Any news?');
    await view.user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText("Your message wasn't sent.")).toBeDefined();
    expect((box as HTMLTextAreaElement).value).toBe('Any news?');
    state.answer = 'ok';
    await view.user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Any news?', { selector: 'p' })).toBeDefined();
    expect(state.sent).toHaveLength(2);
    expect(state.sent[1]?.key).toBe(state.sent[0]?.key);
  });

  it('SUPPORT_TICKET_CLOSED reads the ticket again and shows the closed state', async () => {
    backend({ answer: 'closed' });
    const view = renderSupport(<TicketThread ticketId="t-1" />);
    const box = await screen.findByRole('textbox', { name: /^Your message/ }, FIRST_RENDER);
    await view.user.type(box, 'Hello?');
    await view.user.click(screen.getByRole('button', { name: 'Send' }));

    expect(
      await screen.findByText('This ticket is closed. Open a new ticket if you still need help.'),
    ).toBeDefined();
    expect(screen.queryByRole('textbox', { name: /^Your message/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'New ticket' }).getAttribute('href')).toBe('/support/new');
  });

  it('a solved ticket says how to reopen it and keeps the composer', async () => {
    backend({ ticket: { ...TICKET, status: 'resolved' } });
    renderSupport(<TicketThread ticketId="t-1" />);
    expect(
      await screen.findByText('Marked as solved. Reply within 7 days to reopen it.', undefined, FIRST_RENDER),
    ).toBeDefined();
    expect(screen.getByRole('textbox', { name: /^Your message/ })).toBeDefined();
  });

  it('support typing shows a line for a few seconds; the customer’s own typing never does', async () => {
    backend();
    renderSupport(<TicketThread ticketId="t-1" />);
    await screen.findByText('We are checking.', undefined, FIRST_RENDER);

    emit('support.typing', { ticketId: 't-1', userId: 'u-me', role: 'customer' });
    expect(screen.queryByText('Nile Support is typing…')).toBeNull();
    emit('support.typing', { ticketId: 't-2', userId: 'u-admin', role: 'admin' });
    expect(screen.queryByText('Nile Support is typing…')).toBeNull();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      emit('support.typing', { ticketId: 't-1', userId: 'u-admin', role: 'admin' });
      expect(screen.getByText('Nile Support is typing…')).toBeDefined();
      act(() => {
        vi.advanceTimersByTime(TYPING_VISIBLE_MS);
      });
      expect(screen.queryByText('Nile Support is typing…')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a new message from support is read, marked read and announced', async () => {
    const state = backend();
    const view = renderSupport(<TicketThread ticketId="t-1" />);
    await screen.findByText('We are checking.', undefined, FIRST_RENDER);
    await waitFor(() => {
      expect(state.reads).toBe(1);
    });

    state.messages = [
      ticketMessageFactory({ id: 'm-4', body: 'It ships today.', sender: SUPPORT }),
      ...state.messages,
    ];
    // The app's invalidation map refetches on `support.message_created` (tested with the map).
    await act(() => view.queryClient.invalidateQueries({ queryKey: ['storefront', 'support', 'messages'] }));
    expect(await screen.findByText('It ships today.')).toBeDefined();
    await waitFor(() => {
      expect(state.reads).toBe(2);
    });
    expect(screen.getByText('New message.')).toBeDefined();
  });

  it('"Reconnecting…" only after the thread was live once', async () => {
    realtime.status = 'connecting';
    backend();
    const config = makeConfig();
    // A new element each time: React skips a re-render with the same one.
    const thread = () => (
      <SupportScreensProvider config={config}>
        <TicketThread ticketId="t-1" />
      </SupportScreensProvider>
    );
    const view = renderSupport(<TicketThread ticketId="t-1" />, config);
    await screen.findByText('We are checking.', undefined, FIRST_RENDER);
    expect(screen.queryByText('Reconnecting…')).toBeNull();

    realtime.status = 'connected';
    view.rerender(thread());
    realtime.status = 'disconnected';
    view.rerender(thread());
    expect(screen.getByText('Reconnecting…')).toBeDefined();
  });

  it('"Load earlier messages" reads the next page and puts it above', async () => {
    backend();
    server.use(
      mockApi('get', '/support/tickets/{ticketId}/messages', ({ request, reply }) =>
        new URL(request.url).searchParams.get('cursor') === 'c2'
          ? reply.ok([ticketMessageFactory({ id: 'm-0', body: 'First words' })], PAGE)
          : reply.ok([ticketMessageFactory({ id: 'm-1', body: 'Later words' })], {
              ...PAGE,
              nextCursor: 'c2',
              hasMore: true,
            }),
      ),
    );
    const view = renderSupport(<TicketThread ticketId="t-1" />);
    await view.user.click(await screen.findByRole('button', { name: 'Load earlier messages' }, FIRST_RENDER));
    await screen.findByText('First words');
    const items = bodies();
    expect(items[0]).toContain('First words');
    expect(items[1]).toContain('Later words');
  });

  it("another user's or a missing ticket is not found", async () => {
    server.use(
      mockApi('get', '/support/tickets/{ticketId}', ({ reply }) =>
        reply.error(404, 'SUPPORT_TICKET_NOT_FOUND'),
      ),
    );
    renderSupport(<TicketThread ticketId="t-x" />);
    expect(
      (await screen.findByRole('link', { name: 'Back to your tickets' }, FIRST_RENDER)).getAttribute('href'),
    ).toBe('/support?status=open');
  });
});
