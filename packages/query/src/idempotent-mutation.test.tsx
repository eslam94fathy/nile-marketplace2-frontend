// @vitest-environment jsdom
import { ApiError } from '@nile/api';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IN_PROGRESS_RETRY_DELAY_MS, stableJson, useIdempotentMutation } from './idempotent-mutation';
import { clearIdempotencyIntents } from './intent-store';
import { clearPrivateQueries } from './keys';

type Fn = (vars: { total: string }, key: string) => Promise<string>;

function mount(mutationFn: Fn, scope: readonly string[] = ['payment', 'p-1']) {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return {
    client,
    ...renderHook(() => useIdempotentMutation({ mutationFn, intentScope: scope }), { wrapper }),
  };
}

const setup = (mutationFn: Fn) => mount(mutationFn).result;

afterEach(() => {
  clearIdempotencyIntents();
});

const inProgress = () => new ApiError(409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'busy');
const serverError = () => new ApiError(500, 'INTERNAL_ERROR', 'boom');

describe('stableJson', () => {
  it('ignores key order', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: [3] } })).toBe(stableJson({ a: { c: [3], d: 2 }, b: 1 }));
  });
});

describe('useIdempotentMutation (design 01 §6.1)', () => {
  it('reuses the key when the same intent is retried after a failure', async () => {
    const keys: string[] = [];
    const fn = vi.fn((_vars: { total: string }, key: string) => {
      keys.push(key);
      return keys.length === 1 ? Promise.reject(serverError()) : Promise.resolve('ok');
    });
    const result = setup(fn);
    await act(async () => {
      await result.current.mutateAsync({ total: '10.00' }).catch(() => undefined);
    });
    await act(async () => {
      await result.current.mutateAsync({ total: '10.00' });
    });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it('a changed intent gets a new key; so does the same intent after success or resetIntent()', async () => {
    const keys: string[] = [];
    const result = setup((_vars, key) => {
      keys.push(key);
      return Promise.reject(serverError());
    });
    const send = async (total: string) => {
      await act(async () => {
        await result.current.mutateAsync({ total }).catch(() => undefined);
      });
    };
    await send('10.00');
    await send('12.00');
    act(() => {
      result.current.resetIntent();
    });
    await send('12.00');
    expect(new Set(keys).size).toBe(3);
  });

  describe('the key lives for the tab, per scope (T-O1 F-1)', () => {
    const failing =
      (keys: string[]): Fn =>
      (_vars, key) => {
        keys.push(key);
        return Promise.reject(serverError());
      };
    const send = async (result: ReturnType<typeof mount>['result'], total = '10.00') => {
      await act(async () => {
        await result.current.mutateAsync({ total }).catch(() => undefined);
      });
    };

    it('survives the component being unmounted and mounted again (a dialog closed and reopened)', async () => {
      const keys: string[] = [];
      const first = mount(failing(keys));
      await send(first.result);
      first.unmount();
      await send(mount(failing(keys)).result);
      expect(keys).toHaveLength(2);
      expect(keys[1]).toBe(keys[0]);
    });

    it('another scope (action or target) has its own key', async () => {
      const keys: string[] = [];
      await send(mount(failing(keys), ['payment', 'p-1']).result);
      await send(mount(failing(keys), ['payment', 'p-2']).result);
      await send(mount(failing(keys), ['refund', 'p-1']).result);
      expect(new Set(keys).size).toBe(3);
    });

    it('sign-out (clearPrivateQueries) forgets every intent', async () => {
      const keys: string[] = [];
      const first = mount(failing(keys));
      await send(first.result);
      clearPrivateQueries(first.client);
      await send(first.result);
      expect(keys[1]).not.toBe(keys[0]);
    });
  });

  it('clears the key after success', async () => {
    const keys: string[] = [];
    const result = setup((_vars, key) => {
      keys.push(key);
      return Promise.resolve('ok');
    });
    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        await result.current.mutateAsync({ total: '10.00' });
      });
    }
    expect(keys[0]).not.toBe(keys[1]);
  });

  describe('IDEMPOTENCY_REQUEST_IN_PROGRESS', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('re-sends with the same key after 1 s, at most 3 times, then fails', async () => {
      const keys: string[] = [];
      const result = setup((_vars, key) => {
        keys.push(key);
        return Promise.reject(inProgress());
      });
      let failure: unknown;
      const pending = result.current.mutateAsync({ total: '10.00' }).catch((error: unknown) => {
        failure = error;
      });
      for (let i = 0; i < 3; i += 1) await act(() => vi.advanceTimersByTimeAsync(IN_PROGRESS_RETRY_DELAY_MS));
      await act(() => pending);
      expect(keys).toHaveLength(4);
      expect(new Set(keys).size).toBe(1);
      expect(failure).toBeInstanceOf(ApiError);
    });

    it('a later success after waiting is the result', async () => {
      let calls = 0;
      const result = setup(() => {
        calls += 1;
        return calls === 1 ? Promise.reject(inProgress()) : Promise.resolve('order');
      });
      const pending = result.current.mutateAsync({ total: '10.00' });
      await act(() => vi.advanceTimersByTimeAsync(IN_PROGRESS_RETRY_DELAY_MS));
      await expect(pending).resolves.toBe('order');
      expect(calls).toBe(2);
    });
  });
});
