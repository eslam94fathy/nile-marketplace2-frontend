import type { BffApp } from '@nile/api';
import { vi } from 'vitest';
import {
  createSessionClient,
  type BrowserEnvironment,
  type ChannelLike,
  type LocksLike,
  type SessionClient,
} from '../session-client';

// A simulated browser for the refresh coordinator: one cookie jar, Web Locks and BroadcastChannel shared by
// several tabs, and a fake BFF that behaves like /api/auth/refresh (skips the backend while the token is
// fresh, rotates otherwise) and like a Bearer BFF route (401 UNAUTHENTICATED once the token has expired).

export const START = Date.parse('2026-10-14T08:00:00.000Z');
export const ACCESS_TTL_MS = 15 * 60_000;
export const SKEW_SECONDS = 60;
const APP: BffApp = 'storefront';
const SV_COOKIE = '__Host-nile_storefront_sv';

/** Lets other pending promises run, like real network latency would. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

class FakeLocks implements LocksLike {
  private readonly queues = new Map<string, Promise<unknown>>();

  request<T>(name: string, callback: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(name) ?? Promise.resolve();
    const next = previous.then(callback, callback);
    this.queues.set(
      name,
      next.catch(() => undefined),
    );
    return next;
  }
}

type Listener = (event: { data: unknown }) => void;

class FakeBus {
  private readonly members = new Map<string, Set<FakeChannel>>();

  join(name: string, channel: FakeChannel): void {
    const set = this.members.get(name) ?? new Set();
    set.add(channel);
    this.members.set(name, set);
  }

  deliver(name: string, from: FakeChannel, data: unknown): void {
    for (const member of this.members.get(name) ?? []) {
      if (member !== from)
        queueMicrotask(() => {
          member.receive(data);
        });
    }
  }
}

class FakeChannel implements ChannelLike {
  private readonly listeners = new Set<Listener>();

  constructor(
    private readonly bus: FakeBus,
    private readonly name: string,
  ) {
    bus.join(name, this);
  }

  postMessage(message: unknown): void {
    this.bus.deliver(this.name, this, message);
  }

  addEventListener(_type: 'message', listener: Listener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: Listener): void {
    this.listeners.delete(listener);
  }

  receive(data: unknown): void {
    for (const listener of this.listeners) listener({ data });
  }
}

export type RefreshMode = 'rotate' | 'invalid' | 'unavailable' | 'network-down';

export interface Tab {
  client: SessionClient;
  clearPrivateData: ReturnType<typeof vi.fn>;
  assign: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  /** Pending timers of this tab (fake `setTimeout`), in creation order. */
  timers: { callback: () => void; ms: number; cleared: boolean }[];
  setVisible(visible: boolean): void;
  /** `fetch` for `browserTransport`, through this browser's fake BFF. */
  bffFetch: (request: Request) => Promise<Response>;
}

export class FakeBrowser {
  now = START;
  accessExpiresAt: number | null = START + ACCESS_TTL_MS;
  refreshMode: RefreshMode = 'rotate';
  /** Rotations the backend performed: the number the acceptance criterion is about. */
  backendRefreshCalls = 0;
  /** POST /api/auth/refresh calls that reached the BFF. */
  bffRefreshCalls = 0;
  logoutCalls = 0;
  readonly locks: FakeLocks | null;
  private readonly bus = new FakeBus();
  private readonly cookies = new Map<string, string>();

  constructor(options: { webLocks?: boolean } = {}) {
    this.locks = options.webLocks === false ? null : new FakeLocks();
    this.writeVersion();
  }

  private writeVersion(): void {
    if (this.accessExpiresAt === null) this.cookies.delete(SV_COOKIE);
    else this.cookies.set(SV_COOKIE, String(this.accessExpiresAt));
  }

  /** Time passes for the server and every tab. */
  advance(ms: number): void {
    this.now += ms;
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  private unauthenticated(code: string): Response {
    return this.json(401, { success: false, error: { code, message: code }, correlationId: null });
  }

  /** The fake BFF: auth routes and one Bearer route (`/api/bff/cart`). */
  async handle(path: string): Promise<Response> {
    await tick();
    if (path === '/api/auth/refresh') return this.handleRefresh();
    if (path === '/api/auth/logout') {
      this.logoutCalls += 1;
      this.accessExpiresAt = null;
      this.writeVersion();
      return new Response(null, { status: 204 });
    }
    if (path === '/api/bff/cart') {
      if (this.accessExpiresAt === null || this.accessExpiresAt <= this.now)
        return this.unauthenticated('UNAUTHENTICATED');
      return this.json(200, { success: true, data: { items: [] } });
    }
    return this.json(404, {
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: '' },
      correlationId: null,
    });
  }

  private async handleRefresh(): Promise<Response> {
    this.bffRefreshCalls += 1;
    if (this.refreshMode === 'network-down') throw new TypeError('Failed to fetch');
    if (this.accessExpiresAt === null) return this.unauthenticated('UNAUTHENTICATED');
    if (this.accessExpiresAt - this.now > SKEW_SECONDS * 1000) {
      return this.json(200, { success: true, data: {} });
    }
    if (this.refreshMode === 'unavailable') {
      return this.json(503, {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: '' },
        correlationId: null,
      });
    }
    this.backendRefreshCalls += 1;
    await tick();
    if (this.refreshMode === 'invalid') {
      this.accessExpiresAt = null;
      this.writeVersion();
      return this.unauthenticated('INVALID_REFRESH_TOKEN');
    }
    this.accessExpiresAt = this.now + ACCESS_TTL_MS;
    this.writeVersion();
    return this.json(200, { success: true, data: {} });
  }

  openTab(pathname = '/account/orders', search = ''): Tab {
    const timers: Tab['timers'] = [];
    const visibleListeners = new Set<() => void>();
    let visible = true;
    const clearPrivateData = vi.fn();
    const assign = vi.fn();
    const reload = vi.fn();
    const environment: BrowserEnvironment = {
      fetch: (input) => this.handle(input),
      locks: this.locks,
      openChannel: (name) => new FakeChannel(this.bus, name),
      readCookie: (name) => this.cookies.get(name) ?? null,
      now: () => this.now,
      setTimeout: (callback, ms) => {
        const timer = { callback, ms, cleared: false };
        timers.push(timer);
        return timer;
      },
      clearTimeout: (handle) => {
        (handle as { cleared: boolean }).cleared = true;
      },
      location: { pathname, search, assign, reload },
      isVisible: () => visible,
      onVisible: (listener) => {
        visibleListeners.add(listener);
        return () => visibleListeners.delete(listener);
      },
    };
    const client = createSessionClient({
      app: APP,
      loginPath: '/login',
      signedOutPath: '/',
      isProtectedPath: (path) =>
        ['/cart', '/checkout', '/account'].some((p) => path === p || path.startsWith(`${p}/`)),
      refreshSkewSeconds: SKEW_SECONDS,
      clearPrivateData,
      environment,
    });
    return {
      client,
      clearPrivateData,
      assign,
      reload,
      timers,
      setVisible: (next) => {
        visible = next;
        if (next) for (const listener of visibleListeners) listener();
      },
      bffFetch: (request) => this.handle(new URL(request.url).pathname),
    };
  }
}

/** Waits until queued messages and fake network calls have settled. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await tick();
}
