// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HIDDEN_CLOSE_MS,
  REFETCH_DEBOUNCE_MS,
  RealtimeProvider,
  type RealtimeProviderProps,
  useRealtimeMessage,
  useRealtimeStatus,
} from './provider';
import { TYPING_THROTTLE_MS, useTicketRoom, useTypingSignal } from './signals';
import { fakeSockets, flush } from './test/fake-socket';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setVisibility('visible');
});

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

function harness(props: Partial<RealtimeProviderProps> = {}) {
  const sockets = fakeSockets();
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider
        url="http://realtime.test"
        enabled
        fetchToken={() => Promise.resolve('access-1')}
        refresh={() => Promise.resolve('ok')}
        signOut={vi.fn()}
        scope="storefront"
        invalidationMap={{
          'order.updated': ({ orderId }) => [
            ['storefront', 'orders', 'detail', { orderId }],
            ['storefront', 'orders', 'list'],
          ],
        }}
        createSocket={sockets.createSocket}
        {...props}
      >
        {children}
      </RealtimeProvider>
    </QueryClientProvider>
  );
  return { ...sockets, queryClient, invalidate, wrapper };
}

describe('RealtimeProvider (design 02 §5.3)', () => {
  it('invalidates the mapped query prefixes for a message, once per burst', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { wrapper, current, invalidate } = harness();
    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => {
      current().accept();
    });
    await act(() => vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS));
    invalidate.mockClear();

    act(() => {
      current().message('order.updated', { orderId: 'o1', orderNumber: 'N-1', status: 'placed' }, 'e1');
      current().message('seller_order.placed', { sellerOrderId: 's1', orderNumber: 'N-1' }, 'e2');
    });
    expect(invalidate).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([
      ['storefront', 'orders', 'detail', { orderId: 'o1' }],
      ['storefront', 'orders', 'list'],
    ]);
  });

  it("refetches every query of the app's scope after each (re)connect, never public data", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { wrapper, current, invalidate } = harness();
    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => {
      current().accept();
    });
    await act(() => vi.advanceTimersByTimeAsync(REFETCH_DEBOUNCE_MS));
    expect(invalidate).toHaveBeenCalledTimes(1);
    const predicate = invalidate.mock.calls[0]?.[0]?.predicate;
    const query = (queryKey: readonly unknown[]) =>
      ({ queryKey }) as Parameters<NonNullable<typeof predicate>>[0];
    expect(predicate?.(query(['storefront', 'orders', 'list']))).toBe(true);
    expect(predicate?.(query(['public', 'categories', 'tree']))).toBe(false);
  });

  it('reports the status and runs message handlers', async () => {
    const { wrapper, current } = harness();
    const handler = vi.fn();
    const { result } = renderHook(
      () => {
        useRealtimeMessage('payment.updated', handler);
        return useRealtimeStatus();
      },
      { wrapper },
    );
    await act(flush);
    expect(result.current).toBe('connecting');
    act(() => {
      current().accept();
    });
    expect(result.current).toBe('connected');
    act(() => {
      current().message('payment.updated', { orderId: 'o1', paymentStatus: 'paid' }, 'e9');
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ type: 'payment.updated', eventId: 'e9' }));
  });

  it('opens no socket without a session', () => {
    const { wrapper, sockets } = harness({ enabled: false });
    const { result } = renderHook(() => useRealtimeStatus(), { wrapper });
    expect(sockets).toHaveLength(0);
    expect(result.current).toBe('idle');
  });

  it('closes the socket after 5 minutes hidden and opens it again when shown', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { wrapper, current } = harness();
    renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => {
      current().accept();
    });
    act(() => {
      setVisibility('hidden');
      vi.advanceTimersByTime(HIDDEN_CLOSE_MS - 1);
    });
    expect(current().disconnectCalls).toBe(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(current().disconnectCalls).toBe(1);
    act(() => {
      setVisibility('visible');
    });
    expect(current().connectCalls).toBe(2);
  });

  it('closes the socket when the app unmounts', () => {
    const { wrapper, current } = harness();
    const { unmount } = renderHook(() => useRealtimeStatus(), { wrapper });
    act(() => {
      current().accept();
    });
    unmount();
    expect(current().disconnectCalls).toBe(1);
  });
});

describe('ticket room and typing signals', () => {
  it('subscribes while connected, again after a reconnect, and leaves when the ticket goes', async () => {
    const initialProps: { ticketId: string | null } = { ticketId: 't1' };
    const { wrapper, current } = harness();
    const { rerender } = renderHook(
      ({ ticketId }: { ticketId: string | null }) => {
        useTicketRoom(ticketId);
      },
      { wrapper, initialProps },
    );
    act(() => {
      current().acks.push({ ok: true }, { ok: true });
      current().accept();
    });
    await act(flush);
    act(() => {
      current().drop();
    });
    act(() => {
      current().accept();
    });
    await act(flush);
    rerender({ ticketId: null });
    expect(current().emitted.map(({ event, payload }) => [event, payload])).toEqual([
      ['ticket.subscribe', { ticketId: 't1' }],
      ['ticket.subscribe', { ticketId: 't1' }],
      ['ticket.unsubscribe', { ticketId: 't1' }],
    ]);
  });

  it('reports a ticket that is not found', async () => {
    const { wrapper, current } = harness();
    const onNotFound = vi.fn();
    renderHook(
      () => {
        useTicketRoom('t1', { onNotFound });
      },
      { wrapper },
    );
    act(() => {
      current().acks.push({ ok: false, code: 'SUPPORT_TICKET_NOT_FOUND' });
      current().accept();
    });
    await act(flush);
    expect(onNotFound).toHaveBeenCalledTimes(1);
  });

  it('sends at most one typing signal per 3 s', () => {
    const { wrapper, current } = harness();
    let now = 0;
    const { result } = renderHook(() => useTypingSignal('t1', () => now), { wrapper });
    act(() => {
      current().accept();
    });
    result.current();
    now = TYPING_THROTTLE_MS - 1;
    result.current();
    now = TYPING_THROTTLE_MS;
    result.current();
    expect(current().emitted.filter(({ event }) => event === 'support.typing')).toHaveLength(2);
  });
});

describe('without a provider', () => {
  it('is idle and does nothing', () => {
    function Probe() {
      return <p>{useRealtimeStatus()}</p>;
    }
    render(<Probe />);
    expect(screen.getByText('idle')).toBeDefined();
  });
});
