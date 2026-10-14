import { HEADER, type BffApp } from '@nile/api';

// Browser side of the session (design 01 §5.2–5.3, architecture §5.3). Refresh is serialised across tabs:
// the backend rotates refresh tokens with reuse detection and no grace window, so two refreshes with the
// same token would end the session. Only POST /api/auth/refresh refreshes; this module decides when to call
// it and makes sure a browser calls it once per expiry, whatever the number of tabs and failing requests.

/** BFF auth routes (design 01 §4.1). */
export const AUTH_ROUTES = {
  refresh: '/api/auth/refresh',
  logout: '/api/auth/logout',
} as const;

/** Login page query parameters (spec 01 SF-10, conventions §2). */
export const LOGIN_PARAMS = { returnTo: 'returnTo', notice: 'notice' } as const;
export const SESSION_ENDED_NOTICE = 'session-ended';

/** Gap between proactive checks, so a wrong device clock can't turn the timer into a request loop. */
export const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * - `ok`: the session has a fresh access token (refreshed now, by another tab, or still valid).
 * - `transient`: the refresh couldn't run (network, rate limit, 5xx); the session is kept, a later call retries.
 * - `ended`: the BFF answered 401; the session is over in every tab.
 */
export type RefreshOutcome = 'ok' | 'transient' | 'ended';

/** Why this tab is leaving the signed-in state: the user signed out, or the session ended on its own. */
export type SignOutReason = 'signed-out' | 'session-ended';

type SessionMessage = { type: 'refreshed' } | { type: 'signed-out'; reason: SignOutReason };

export interface ChannelLike {
  postMessage(message: SessionMessage): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
}

export interface LocksLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/** Everything the coordinator takes from the browser; tests pass fakes, the app passes nothing. */
export interface BrowserEnvironment {
  fetch: (input: string, init: RequestInit) => Promise<Response>;
  /** `navigator.locks`, or null where Web Locks is unavailable (in-tab single flight only). */
  locks: LocksLike | null;
  /** A `BroadcastChannel` for this app's session, or null where unavailable. */
  openChannel: (name: string) => ChannelLike | null;
  readCookie: (name: string) => string | null;
  now: () => number;
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  location: { readonly pathname: string; readonly search: string; assign(url: string): void; reload(): void };
  isVisible: () => boolean;
  onVisible: (listener: () => void) => () => void;
}

export interface SessionClientOptions {
  app: BffApp;
  /** This app's sign-in page. */
  loginPath: string;
  /**
   * Where a tab on a protected page goes after the user signs out (conventions §2): the public home on the
   * storefront, the sign-in page in the portals.
   */
  signedOutPath: string;
  /** Pages that need a session; a tab on one of them goes to sign-in when the session ends. */
  isProtectedPath: (pathname: string) => boolean;
  /** `NEXT_PUBLIC_REFRESH_SKEW_SECONDS`: refresh this long before the access token expires. */
  refreshSkewSeconds: number;
  /** Drops every cached private query (`clearPrivateQueries`), so no data of the old session is shown. */
  clearPrivateData: () => void;
  /** Tests only: a simulated browser. */
  environment?: BrowserEnvironment;
}

/** Plain functions (no `this`), so they can be passed on, e.g. `onUnauthenticated` to the transport. */
export interface SessionClient {
  /** Makes sure the access token is fresh; one backend refresh per browser however many callers. */
  refresh: () => Promise<RefreshOutcome>;
  /** For `browserTransport({ onUnauthenticated })`: true when the failed call may be retried once. */
  onUnauthenticated: () => Promise<boolean>;
  /** Ends the session on the server and in every tab of this app. */
  signOut: (reason?: SignOutReason) => Promise<void>;
  /** Proactive refresh timer and cross-tab messages; returns a stop function. */
  start: () => () => void;
}

/** Name of the readable session-version cookie, with or without the `__Host-` prefix (design 01 §3.1). */
export function sessionVersionCookieNames(app: BffApp): readonly string[] {
  return [`__Host-nile_${app}_sv`, `nile_${app}_sv`];
}

export function readDocumentCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

function browserEnvironment(): BrowserEnvironment {
  return {
    fetch: (input, init) => globalThis.fetch(input, init),
    locks: typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null,
    openChannel: (name) => (typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(name)),
    readCookie: readDocumentCookie,
    now: () => Date.now(),
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => {
      window.clearTimeout(handle as number);
    },
    location: window.location,
    isVisible: () => document.visibilityState === 'visible',
    onVisible: (listener) => {
      const handler = () => {
        if (document.visibilityState === 'visible') listener();
      };
      document.addEventListener('visibilitychange', handler);
      return () => {
        document.removeEventListener('visibilitychange', handler);
      };
    },
  };
}

function isSessionMessage(data: unknown): data is SessionMessage {
  if (typeof data !== 'object' || data === null) return false;
  const { type, reason } = data as { type?: unknown; reason?: unknown };
  return (
    type === 'refreshed' || (type === 'signed-out' && (reason === 'signed-out' || reason === 'session-ended'))
  );
}

/**
 * One per app and page (create it at module level; nothing touches browser globals until a method runs, so
 * the module can be imported while rendering on the server).
 */
export function createSessionClient(options: SessionClientOptions): SessionClient {
  const lockName = `nile-${options.app}-refresh`;
  const channelName = `nile-${options.app}-session`;
  const skewMs = options.refreshSkewSeconds * 1000;
  let env: BrowserEnvironment | undefined;
  let channel: ChannelLike | null | undefined;
  let inFlight: Promise<RefreshOutcome> | undefined;

  const environment = (): BrowserEnvironment => {
    env ??= options.environment ?? browserEnvironment();
    return env;
  };
  const getChannel = (): ChannelLike | null => {
    if (channel === undefined) channel = environment().openChannel(channelName);
    return channel;
  };
  const broadcast = (message: SessionMessage): void => {
    getChannel()?.postMessage(message);
  };

  /** Access-token expiry (epoch ms) from the session-version cookie; null when signed out. */
  const sessionVersion = (): number | null => {
    for (const name of sessionVersionCookieNames(options.app)) {
      const value = environment().readCookie(name);
      if (value !== null && /^\d+$/.test(value)) return Number(value);
    }
    return null;
  };

  const leave = (reason: SignOutReason): void => {
    options.clearPrivateData();
    const { location } = environment();
    if (!options.isProtectedPath(location.pathname)) {
      // A public page stays where it is and renders signed out.
      location.reload();
      return;
    }
    if (reason === 'signed-out') {
      location.assign(options.signedOutPath);
      return;
    }
    const params = new URLSearchParams({
      [LOGIN_PARAMS.notice]: SESSION_ENDED_NOTICE,
      [LOGIN_PARAMS.returnTo]: `${location.pathname}${location.search}`,
    });
    location.assign(`${options.loginPath}?${params.toString()}`);
  };

  const endSession = (reason: SignOutReason): void => {
    broadcast({ type: 'signed-out', reason });
    leave(reason);
  };

  const post = (path: string): Promise<Response> =>
    environment().fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { [HEADER.CLIENT]: '1', [HEADER.CORRELATION_ID]: crypto.randomUUID() },
    });

  async function refreshHoldingLock(observedVersion: number | null): Promise<RefreshOutcome> {
    // Another tab refreshed while this one waited for the lock: its new cookie is already ours. Comparing
    // versions (not the clock) keeps this right on devices whose clock is off.
    const current = sessionVersion();
    if (current !== null && current !== observedVersion) return 'ok';
    let response: Response;
    try {
      response = await post(AUTH_ROUTES.refresh);
    } catch {
      return 'transient';
    }
    if (response.ok) {
      broadcast({ type: 'refreshed' });
      return 'ok';
    }
    // Only a 401 ends the session (INVALID_REFRESH_TOKEN, or no session cookie left); anything else is
    // transient and the session is kept (decided 2026-10-14, design 01 R-21).
    if (response.status === 401) {
      endSession('session-ended');
      return 'ended';
    }
    return 'transient';
  }

  const refresh = (): Promise<RefreshOutcome> => {
    if (inFlight !== undefined) return inFlight;
    const observed = sessionVersion();
    const { locks } = environment();
    const run = locks
      ? locks.request(lockName, () => refreshHoldingLock(observed))
      : refreshHoldingLock(observed);
    inFlight = run.finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };

  const signOut = async (reason: SignOutReason = 'signed-out'): Promise<void> => {
    try {
      await post(AUTH_ROUTES.logout);
    } catch {
      // The cookie stays until the next successful call; the tab still leaves the signed-in state.
    }
    endSession(reason);
  };

  const start = (): (() => void) => {
    const current = environment();
    let timer: unknown;
    let lastCheck = Number.NEGATIVE_INFINITY;

    const cancel = () => {
      if (timer !== undefined) current.clearTimeout(timer);
      timer = undefined;
    };

    const check = async (): Promise<void> => {
      cancel();
      lastCheck = current.now();
      const outcome = await refresh();
      if (outcome !== 'ended') schedule();
    };

    function schedule(): void {
      cancel();
      const version = sessionVersion();
      if (version === null || !current.isVisible()) return;
      const due = version - skewMs - current.now();
      const sinceLast = current.now() - lastCheck;
      const delay = Math.max(due, MIN_REFRESH_INTERVAL_MS - sinceLast, 0);
      timer = current.setTimeout(() => void check(), delay);
    }

    const onMessage = (event: { data: unknown }) => {
      if (!isSessionMessage(event.data)) return;
      if (event.data.type === 'refreshed') schedule();
      else leave(event.data.reason);
    };

    const stopVisible = current.onVisible(schedule);
    getChannel()?.addEventListener('message', onMessage);
    schedule();
    return () => {
      cancel();
      stopVisible();
      getChannel()?.removeEventListener('message', onMessage);
    };
  };

  return {
    refresh,
    onUnauthenticated: async () => (await refresh()) === 'ok',
    signOut,
    start,
  };
}
