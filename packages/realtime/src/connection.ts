import {
  isApiError,
  isRealtimeMessage,
  type RealtimeConnectErrorCode,
  type RealtimeDisconnectReason,
  type RealtimeMessage,
} from '@nile/api';

// One socket per tab (design 01 §15.3, backend docs/realtime.md). Framework-free: the React provider drives it.
// The socket only notifies; the app refetches over REST. The access token lives only in this closure (CLAUDE.md
// §4 exception): fetched for each connect, never stored, logged or handed out.

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';

/** The parts of a Socket.IO client socket used here (a fake in tests). */
export interface SocketLike {
  readonly active: boolean;
  readonly connected: boolean;
  connect(): unknown;
  disconnect(): unknown;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  onAny(listener: (event: string, ...args: unknown[]) => void): unknown;
  emit(event: string, ...args: unknown[]): unknown;
  timeout(ms: number): { emitWithAck(event: string, ...args: unknown[]): Promise<unknown> };
}

export interface SocketOptions {
  readonly path: string;
  readonly transports: string[];
  readonly autoConnect: boolean;
  readonly reconnection: boolean;
  readonly reconnectionDelay: number;
  readonly reconnectionDelayMax: number;
  readonly auth: (callback: (data: { token?: string }) => void) => void;
}

/** Synchronous in tests; the default loads the Socket.IO client on first use (a promise). */
export type CreateSocket = (url: string, options: SocketOptions) => SocketLike | Promise<SocketLike>;

/** Result of the session coordinator's refresh (`@nile/auth` `SessionClient.refresh`). */
export type RefreshOutcome = 'ok' | 'transient' | 'ended';

export interface RealtimeConnectionOptions {
  /** `NEXT_PUBLIC_REALTIME_URL` (the realtime service origin). */
  readonly url: string;
  /** `POST /api/auth/realtime-token`; rejects with `ApiError` (`UNAUTHENTICATED` when the token is near expiry). */
  readonly fetchToken: () => Promise<string>;
  readonly refresh: () => Promise<RefreshOutcome>;
  /** `account_suspended`: end the session in every tab. */
  readonly signOut: () => void;
  readonly onMessage: (message: RealtimeMessage) => void;
  readonly onStatus: (status: RealtimeStatus) => void;
  /** After every (re)connect: the app refetches what it shows (messages were lost meanwhile). */
  readonly onConnected: () => void;
  /** A configuration problem (`ORIGIN_NOT_ALLOWED`, `FORBIDDEN`): the socket stays off, polling carries on. */
  readonly onWarn?: (code: string) => void;
  readonly createSocket?: CreateSocket;
  readonly random?: () => number;
  readonly setTimer?: (callback: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export interface RealtimeConnection {
  start(): void;
  stop(): void;
  readonly status: () => RealtimeStatus;
  /** A signal with an ack (`ticket.subscribe`); rejects when not connected or on timeout. */
  emitWithAck(signal: string, payload: unknown): Promise<unknown>;
  /** A signal without an ack (`support.typing`); dropped while not connected. */
  emit(signal: string, payload: unknown): void;
}

/** Socket.IO's own reconnect after a transport failure: 1 s, randomised, doubling up to 30 s (design 01 §15.3). */
export const RECONNECT_DELAY_MS = 1_000;
export const RECONNECT_DELAY_MAX_MS = 30_000;
/** `server_shutting_down`: reconnect after a random 0–5 s, so a deploy isn't hit by every tab at once. */
export const SHUTDOWN_RECONNECT_MAX_MS = 5_000;
/** Consecutive `UNAUTHENTICATED` refusals after a successful refresh before giving up (e.g. a suspended account). */
export const MAX_AUTH_REFUSALS = 3;
/** Messages remembered for dedupe (`eventId:type`). */
export const DEDUPE_SIZE = 500;
export const ACK_TIMEOUT_MS = 5_000;

const SOCKET_PATH = '/realtime';
const SESSION_ENDED = 'session.ended';

// Loaded on the first connect only (T-O3): signed-out visitors and the first paint never download the client.
const defaultCreateSocket: CreateSocket = async (url, options) => {
  const { io } = await import('socket.io-client');
  return io(url, options);
};

const isPromise = <T>(value: T | Promise<T>): value is Promise<T> =>
  typeof (value as { then?: unknown } | null)?.then === 'function';

const STOP_CODES: ReadonlySet<string> = new Set<RealtimeConnectErrorCode>([
  'ORIGIN_NOT_ALLOWED',
  'FORBIDDEN',
]);

function connectErrorCode(error: unknown): string | null {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return typeof data?.code === 'string' ? data.code : null;
}

class NoToken extends Error {
  override readonly name = 'NoToken';
}

export function createRealtimeConnection(options: RealtimeConnectionOptions): RealtimeConnection {
  const createSocket = options.createSocket ?? defaultCreateSocket;
  const random = options.random ?? Math.random;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ??
    ((handle) => {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    });

  let socket: SocketLike | null = null;
  let loading = false;
  let status: RealtimeStatus = 'idle';
  let running = false;
  let retryTimer: unknown = null;
  let retries = 0;
  let authRefusals = 0;
  let endReason: RealtimeDisconnectReason | null = null;
  const seen: string[] = [];
  const seenSet = new Set<string>();

  const setStatus = (next: RealtimeStatus) => {
    if (next === status) return;
    status = next;
    options.onStatus(next);
  };

  const clearRetry = () => {
    if (retryTimer !== null) clearTimer(retryTimer);
    retryTimer = null;
  };

  const connectNow = () => {
    clearRetry();
    if (!running) return;
    if (socket === null) {
      load();
      return;
    }
    if (socket.connected) return;
    setStatus('connecting');
    socket.connect();
  };

  const adopt = (created: SocketLike) => {
    socket = wire(created);
    connectNow();
  };

  /** Creates the socket once; a failed load of the client is retried like a refused connection. */
  const load = () => {
    if (loading) return;
    const created = createSocket(options.url, socketOptions());
    if (!isPromise(created)) {
      adopt(created);
      return;
    }
    loading = true;
    setStatus('connecting');
    created.then(
      (ready) => {
        loading = false;
        adopt(ready);
      },
      () => {
        loading = false;
        connectLater(backoff());
      },
    );
  };

  const connectLater = (ms: number) => {
    clearRetry();
    if (!running) return;
    setStatus('disconnected');
    retryTimer = setTimer(connectNow, ms);
  };

  /** Our own back-off for refusals Socket.IO doesn't retry: 1 s doubling to 30 s, randomised to 50–100 %. */
  const backoff = () => {
    const base = Math.min(RECONNECT_DELAY_MAX_MS, RECONNECT_DELAY_MS * 2 ** retries);
    retries += 1;
    return Math.round(base * (0.5 + random() / 2));
  };

  /** A fresh token for this handshake; refreshes first when the BFF says it is about to expire. */
  const obtainToken = async (): Promise<string> => {
    try {
      return await options.fetchToken();
    } catch (error) {
      if (!isApiError(error, 'UNAUTHENTICATED')) throw error;
    }
    const outcome = await options.refresh();
    if (outcome === 'ended') {
      // The coordinator signs this tab out; nothing to reconnect.
      running = false;
      throw new NoToken('session ended');
    }
    if (outcome === 'transient') throw new NoToken('refresh failed');
    return options.fetchToken();
  };

  const remember = (key: string): boolean => {
    if (seenSet.has(key)) return false;
    seen.push(key);
    seenSet.add(key);
    if (seen.length > DEDUPE_SIZE) {
      const oldest = seen.shift();
      if (oldest !== undefined) seenSet.delete(oldest);
    }
    return true;
  };

  const handleConnectError = (error: unknown) => {
    if (!running || socket === null) return;
    // Transport failure: Socket.IO retries by itself with its own back-off.
    if (socket.active) {
      setStatus('connecting');
      return;
    }
    const code = connectErrorCode(error);
    if (code !== null && STOP_CODES.has(code)) {
      running = false;
      setStatus('disconnected');
      options.onWarn?.(code);
      return;
    }
    if (code === 'UNAUTHENTICATED') {
      authRefusals += 1;
      if (authRefusals > MAX_AUTH_REFUSALS) {
        running = false;
        setStatus('disconnected');
        options.onWarn?.(code);
        return;
      }
      void options.refresh().then((outcome) => {
        if (outcome === 'ended') {
          running = false;
          setStatus('disconnected');
          return;
        }
        connectLater(backoff());
      });
      setStatus('disconnected');
      return;
    }
    // RATE_LIMITED, SERVICE_UNAVAILABLE, INTERNAL_ERROR, no token, anything unknown.
    connectLater(backoff());
  };

  const handleDisconnect = (reason: string) => {
    if (!running) {
      setStatus('idle');
      return;
    }
    if (reason !== 'io server disconnect') {
      // Transport loss: Socket.IO reconnects by itself ('io client disconnect' only comes from stop()).
      setStatus('connecting');
      return;
    }
    const why = endReason;
    endReason = null;
    if (why === 'account_suspended') {
      running = false;
      setStatus('disconnected');
      options.signOut();
      return;
    }
    if (why === 'token_expired') {
      // The auth callback fetches a new token (and refreshes first when needed).
      connectNow();
      return;
    }
    // A deploy, or a close without a reason: spread the reconnects.
    connectLater(Math.round(random() * SHUTDOWN_RECONNECT_MAX_MS));
  };

  const handleAny = (event: string, payload?: unknown) => {
    if (event === SESSION_ENDED) {
      const reason = (payload as { data?: { reason?: unknown } } | undefined)?.data?.reason;
      endReason =
        reason === 'token_expired' || reason === 'server_shutting_down' || reason === 'account_suspended'
          ? reason
          : null;
      return;
    }
    if (!isRealtimeMessage(payload) || payload.type !== event) return;
    if (!remember(`${payload.eventId}:${payload.type}`)) return;
    options.onMessage(payload);
  };

  const socketOptions = (): SocketOptions => ({
    path: SOCKET_PATH,
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: RECONNECT_DELAY_MS,
    reconnectionDelayMax: RECONNECT_DELAY_MAX_MS,
    auth: (callback) => {
      obtainToken().then(
        (token) => {
          callback({ token });
        },
        () => {
          // The server answers UNAUTHENTICATED (or the connection was stopped meanwhile).
          callback({});
        },
      );
    },
  });

  const wire = (created: SocketLike): SocketLike => {
    created.on('connect', () => {
      retries = 0;
      authRefusals = 0;
      setStatus('connected');
      options.onConnected();
    });
    created.on('connect_error', handleConnectError);
    created.on('disconnect', (reason) => {
      handleDisconnect(String(reason));
    });
    created.onAny(handleAny);
    return created;
  };

  return {
    start() {
      if (running) return;
      running = true;
      connectNow();
    },
    stop() {
      running = false;
      clearRetry();
      socket?.disconnect();
      setStatus('idle');
    },
    status: () => status,
    emitWithAck(signal, payload) {
      if (socket?.connected !== true) return Promise.reject(new Error('not connected'));
      return socket.timeout(ACK_TIMEOUT_MS).emitWithAck(signal, payload);
    },
    emit(signal, payload) {
      if (socket?.connected === true) socket.emit(signal, payload);
    },
  };
}
