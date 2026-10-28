import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

// The service worker's handlers in a stubbed worker scope (design 01 §15.10): the file runs as the browser
// would run it, with `self` providing the registration and the clients.

const SOURCE = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8');
const ORIGIN = 'https://shop.nile.test';

type Listener = (event: Record<string, unknown>) => void;

interface FakeClient {
  url: string;
  focus: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
}

function loadWorker(clients: FakeClient[] = []) {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(() => Promise.resolve());
  const openWindow = vi.fn(() => Promise.resolve(null));
  const self = {
    location: { origin: ORIGIN },
    registration: { showNotification },
    skipWaiting: vi.fn(() => Promise.resolve()),
    clients: {
      claim: vi.fn(() => Promise.resolve()),
      matchAll: vi.fn(() => Promise.resolve(clients)),
      openWindow,
    },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  runInNewContext(SOURCE, { self, URL });
  /** Dispatches an event and waits for what it passed to `waitUntil`. */
  const dispatch = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve();
    listeners.get(type)?.({
      ...event,
      waitUntil: (promise: Promise<unknown>) => {
        pending = promise;
      },
    });
    await pending;
  };
  return { dispatch, showNotification, openWindow, self };
}

const pushEvent = (payload: unknown) => ({
  data: {
    json: () => {
      if (typeof payload === 'string') throw new SyntaxError('not JSON');
      return payload;
    },
  },
});

function clickEvent(data: unknown) {
  const close = vi.fn();
  return { event: { notification: { data, close } }, close };
}

function client(url: string, navigate = vi.fn(() => Promise.resolve(null))): FakeClient {
  const fake: FakeClient = { url, navigate, focus: vi.fn(() => Promise.resolve(fake)) };
  return fake;
}

describe('service worker: push', () => {
  it('shows title and body with the brand icon, tagged by the notification id; keeps the link for the click', async () => {
    const worker = loadWorker();
    await worker.dispatch(
      'push',
      pushEvent({
        notificationId: 'n-1',
        title: 'Order accepted',
        body: 'Order #1 was accepted.',
        link: '/orders/1',
        category: 'orders',
      }),
    );

    expect(worker.showNotification).toHaveBeenCalledWith('Order accepted', {
      body: 'Order #1 was accepted.',
      icon: '/icons/icon-192.png',
      tag: 'n-1',
      data: { link: '/orders/1' },
    });
  });

  it('ignores a payload that is not JSON or has no title', async () => {
    const worker = loadWorker();
    await worker.dispatch('push', pushEvent('garbage'));
    await worker.dispatch('push', pushEvent({ body: 'no title' }));
    expect(worker.showNotification).not.toHaveBeenCalled();
  });
});

describe('service worker: notification click (spec 00 §12.6)', () => {
  it('focuses an open tab of the app and navigates it to the open route with the API link', async () => {
    const tab = client(`${ORIGIN}/account/orders`);
    const worker = loadWorker([client('https://other.test/'), tab]);
    const { event, close } = clickEvent({ link: '/orders/1' });

    await worker.dispatch('notificationclick', event);

    expect(close).toHaveBeenCalled();
    expect(tab.focus).toHaveBeenCalled();
    expect(tab.navigate).toHaveBeenCalledWith(`${ORIGIN}/notifications/open?link=%2Forders%2F1`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('opens a new tab when none is open, or when the open one cannot be navigated', async () => {
    const worker = loadWorker();
    await worker.dispatch('notificationclick', clickEvent({ link: '/orders/1' }).event);
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/notifications/open?link=%2Forders%2F1`);

    const uncontrolled = client(
      `${ORIGIN}/`,
      vi.fn(() => Promise.reject(new TypeError('not controlled'))),
    );
    const second = loadWorker([uncontrolled]);
    await second.dispatch('notificationclick', clickEvent({ link: null }).event);
    expect(second.openWindow).toHaveBeenCalledWith(`${ORIGIN}/notifications/open`);
  });

  it('takes control at once so a click can navigate open tabs', async () => {
    const worker = loadWorker();
    await worker.dispatch('install', {});
    await worker.dispatch('activate', {});
    expect(worker.self.skipWaiting).toHaveBeenCalled();
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it('has no fetch handler (no offline mode, design 01 §15.5)', () => {
    expect(SOURCE).not.toMatch(/addEventListener\(\s*['"]fetch['"]/);
  });
});
