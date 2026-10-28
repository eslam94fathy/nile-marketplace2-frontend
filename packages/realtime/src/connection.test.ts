import { ApiError, type RealtimeMessage } from '@nile/api';
import { describe, expect, it, vi } from 'vitest';
import {
  createRealtimeConnection,
  DEDUPE_SIZE,
  MAX_AUTH_REFUSALS,
  type RealtimeConnectionOptions,
  type RealtimeStatus,
  type RefreshOutcome,
} from './connection';
import { fakeSockets, flush } from './test/fake-socket';

/** Manual timers: `run()` fires everything due, in order. */
function manualTimers() {
  const queue: { callback: () => void; ms: number }[] = [];
  return {
    setTimer: (callback: () => void, ms: number) => {
      const entry = { callback, ms };
      queue.push(entry);
      return entry;
    },
    clearTimer: (handle: unknown) => {
      const index = queue.indexOf(handle as (typeof queue)[number]);
      if (index !== -1) queue.splice(index, 1);
    },
    delays: () => queue.map((entry) => entry.ms),
    run: () => {
      for (const entry of queue.splice(0)) entry.callback();
    },
  };
}

function setup(overrides: Partial<RealtimeConnectionOptions> = {}) {
  const sockets = fakeSockets();
  const timers = manualTimers();
  const statuses: RealtimeStatus[] = [];
  let tokenCount = 0;
  const options = {
    url: 'http://realtime.test',
    fetchToken: vi.fn(() => Promise.resolve(`access-${String((tokenCount += 1))}`)),
    refresh: vi.fn((): Promise<RefreshOutcome> => Promise.resolve('ok')),
    signOut: vi.fn(),
    onMessage: vi.fn<(message: RealtimeMessage) => void>(),
    onStatus: (status: RealtimeStatus) => statuses.push(status),
    onConnected: vi.fn(),
    onWarn: vi.fn(),
    createSocket: sockets.createSocket,
    random: () => 1,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    ...overrides,
  };
  const connection = createRealtimeConnection(options);
  return { connection, options, statuses, timers, ...sockets };
}

describe('realtime connection (design 01 §15.3)', () => {
  it('connects over websocket at /realtime with a fresh token for each handshake', async () => {
    const { connection, current, options } = setup();
    connection.start();
    await flush();
    const socket = current();
    expect(socket.url).toBe('http://realtime.test');
    expect(socket.options).toMatchObject({
      path: '/realtime',
      transports: ['websocket'],
      autoConnect: false,
    });
    expect(socket.tokens).toEqual(['access-1']);
    socket.accept();
    expect(connection.status()).toBe('connected');
    expect(options.onConnected).toHaveBeenCalledTimes(1);

    socket.drop();
    socket.connect(); // Socket.IO's own reconnect calls the auth callback again
    await flush();
    expect(socket.tokens).toEqual(['access-1', 'access-2']);
  });

  it('refreshes first when the BFF says the token is about to expire', async () => {
    const fetchToken = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new ApiError(401, 'UNAUTHENTICATED', 'near expiry'))
      .mockResolvedValue('access-new');
    const { connection, current, options } = setup({ fetchToken });
    connection.start();
    await flush();
    expect(options.refresh).toHaveBeenCalledTimes(1);
    expect(current().tokens).toEqual(['access-new']);
  });

  it('stops when the refresh says the session has ended', async () => {
    const { connection, current, options } = setup({
      fetchToken: () => Promise.reject(new ApiError(401, 'UNAUTHENTICATED', 'gone')),
      refresh: vi.fn(() => Promise.resolve<RefreshOutcome>('ended')),
    });
    connection.start();
    await flush();
    current().refuse('UNAUTHENTICATED');
    await flush();
    expect(options.refresh).toHaveBeenCalledTimes(1);
    expect(current().connectCalls).toBe(1);
  });

  it('drops duplicates by eventId + type, keeping one message per type of an event', () => {
    const { connection, current, options } = setup();
    connection.start();
    current().accept();
    current().message('order.updated', { orderId: 'o1', orderNumber: 'N-1', status: 'placed' }, 'e1');
    current().message('order.updated', { orderId: 'o1', orderNumber: 'N-1', status: 'placed' }, 'e1');
    current().message('payment.updated', { orderId: 'o1', paymentStatus: 'paid' }, 'e1');
    expect(vi.mocked(options.onMessage).mock.calls.map(([message]) => message.type)).toEqual([
      'order.updated',
      'payment.updated',
    ]);
  });

  it('forgets the oldest ids beyond the dedupe window', () => {
    const { connection, current, options } = setup();
    connection.start();
    current().accept();
    for (let i = 0; i <= DEDUPE_SIZE; i += 1)
      current().message('media.updated', { mediaId: 'm', status: 'ready' }, `e${String(i)}`);
    current().message('media.updated', { mediaId: 'm', status: 'ready' }, 'e0');
    expect(options.onMessage).toHaveBeenCalledTimes(DEDUPE_SIZE + 2);
  });

  it('ignores unknown events and malformed envelopes', () => {
    const { connection, current, options } = setup();
    connection.start();
    current().accept();
    current().message('something.new', { id: 'x' });
    current().raw('order.updated', { type: 'order.updated', data: {} });
    current().raw('order.updated', { type: 'payment.updated', eventId: 'e', occurredAt: 'now', data: {} });
    expect(options.onMessage).not.toHaveBeenCalled();
  });

  it('token_expired: connects again at once with a new token', async () => {
    const { connection, current } = setup();
    connection.start();
    await flush();
    current().accept();
    current().end('token_expired');
    await flush();
    expect(current().connectCalls).toBe(2);
    expect(current().tokens).toEqual(['access-1', 'access-2']);
  });

  it('server_shutting_down: connects again after a random 0–5 s', () => {
    const { connection, current, timers } = setup({ random: () => 0.4 });
    connection.start();
    current().accept();
    current().end('server_shutting_down');
    expect(connection.status()).toBe('disconnected');
    expect(timers.delays()).toEqual([2_000]);
    timers.run();
    expect(current().connectCalls).toBe(2);
  });

  it('account_suspended: signs out and stays off', () => {
    const { connection, current, options, timers } = setup();
    connection.start();
    current().accept();
    current().end('account_suspended');
    expect(options.signOut).toHaveBeenCalledTimes(1);
    expect(timers.delays()).toEqual([]);
    expect(current().connectCalls).toBe(1);
  });

  it('UNAUTHENTICATED refusal: refreshes, then retries with back-off; gives up after repeated refusals', async () => {
    const { connection, current, options, timers } = setup();
    connection.start();
    for (let refusal = 1; refusal <= MAX_AUTH_REFUSALS; refusal += 1) {
      current().refuse('UNAUTHENTICATED');
      await flush();
      expect(options.refresh).toHaveBeenCalledTimes(refusal);
      timers.run();
    }
    current().refuse('UNAUTHENTICATED');
    await flush();
    expect(connection.status()).toBe('disconnected');
    expect(options.onWarn).toHaveBeenCalledWith('UNAUTHENTICATED');
    expect(timers.delays()).toEqual([]);
  });

  it.each(['ORIGIN_NOT_ALLOWED', 'FORBIDDEN'])(
    '%s is a configuration problem: warns and stays off',
    (code) => {
      const { connection, current, options, timers } = setup();
      connection.start();
      current().refuse(code);
      expect(options.onWarn).toHaveBeenCalledWith(code);
      expect(connection.status()).toBe('disconnected');
      expect(timers.delays()).toEqual([]);
    },
  );

  it.each(['RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR'])(
    '%s: retries with a doubling back-off',
    (code) => {
      const { connection, current, timers } = setup();
      connection.start();
      current().refuse(code);
      expect(timers.delays()).toEqual([1_000]);
      timers.run();
      current().refuse(code);
      expect(timers.delays()).toEqual([2_000]);
    },
  );

  it('leaves transport failures to Socket.IO and resets the back-off after a connect', () => {
    const { connection, current, timers } = setup();
    connection.start();
    current().transportError();
    expect(connection.status()).toBe('connecting');
    expect(timers.delays()).toEqual([]);
    current().refuse('RATE_LIMITED');
    timers.run();
    current().accept();
    current().refuse('RATE_LIMITED');
    expect(timers.delays()).toEqual([1_000]);
  });

  it('stop() closes the socket and cancels a pending retry', () => {
    const { connection, current, timers, statuses } = setup();
    connection.start();
    current().refuse('RATE_LIMITED');
    connection.stop();
    expect(timers.delays()).toEqual([]);
    expect(current().disconnectCalls).toBe(1);
    expect(statuses.at(-1)).toBe('idle');
  });

  it('sends signals only while connected', async () => {
    const { connection, current } = setup();
    connection.start();
    connection.emit('support.typing', { ticketId: 't' });
    await expect(connection.emitWithAck('ticket.subscribe', { ticketId: 't' })).rejects.toThrow();
    current().accept();
    current().acks.push({ ok: true });
    connection.emit('support.typing', { ticketId: 't' });
    await expect(connection.emitWithAck('ticket.subscribe', { ticketId: 't' })).resolves.toEqual({
      ok: true,
    });
    expect(current().emitted.map((entry) => entry.event)).toEqual(['support.typing', 'ticket.subscribe']);
  });
});
