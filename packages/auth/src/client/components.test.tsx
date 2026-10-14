// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionExpiredBoundary, SessionManager } from './components';
import type { RefreshOutcome, SessionClient } from './session-client';

const routerRefresh = vi.fn();
// Like Next.js, the same router object on every render.
const router = { refresh: routerRefresh };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  routerRefresh.mockReset();
});

function fakeClient(...outcomes: RefreshOutcome[]): SessionClient & { stop: ReturnType<typeof vi.fn> } {
  const queue = [...outcomes];
  const stop = vi.fn();
  return {
    refresh: vi.fn(() => Promise.resolve(queue.shift() ?? 'ok')),
    onUnauthenticated: vi.fn(),
    signOut: vi.fn(),
    start: vi.fn(() => stop),
    stop,
  };
}

/** Lets the refresh promise resolve and React apply the resulting state. */
const flush = () => act(() => Promise.resolve());

const boundary = (client: SessionClient) => (
  <SessionExpiredBoundary
    client={client}
    pending={<p>Restoring session</p>}
    failed={(retry) => (
      <button type="button" onClick={retry}>
        Try again
      </button>
    )}
  />
);

describe('SessionExpiredBoundary', () => {
  it('refreshes, then re-renders the route', async () => {
    const client = fakeClient('ok');
    render(boundary(client));
    expect(screen.getByText('Restoring session')).toBeDefined();
    await flush();
    expect(client.refresh).toHaveBeenCalledTimes(1);
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it('offers a retry after a transient failure', async () => {
    const client = fakeClient('transient', 'ok');
    render(boundary(client));
    await flush();
    expect(routerRefresh).not.toHaveBeenCalled();
    act(() => {
      screen.getByRole('button', { name: 'Try again' }).click();
    });
    await flush();
    expect(client.refresh).toHaveBeenCalledTimes(2);
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });

  it('does nothing more when the session ended (the coordinator navigates to sign-in)', async () => {
    const client = fakeClient('ended');
    render(boundary(client));
    await flush();
    expect(routerRefresh).not.toHaveBeenCalled();
    expect(screen.getByText('Restoring session')).toBeDefined();
  });
});

describe('SessionManager', () => {
  it('starts the coordinator on mount and stops it on unmount', () => {
    const client = fakeClient();
    const { unmount } = render(<SessionManager client={client} />);
    expect(client.start).toHaveBeenCalledTimes(1);
    unmount();
    expect(client.stop).toHaveBeenCalledTimes(1);
  });
});
