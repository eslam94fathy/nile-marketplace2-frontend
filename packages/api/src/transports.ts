import type { Middleware } from 'openapi-fetch';

/** Backend API prefix; every generated path starts with it (`/api/v1/products`). */
export const API_PREFIX = '/api/v1';

export const HEADER = {
  AUTHORIZATION: 'Authorization',
  CORRELATION_ID: 'X-Correlation-Id',
  IDEMPOTENCY_KEY: 'Idempotency-Key',
  /** Marks requests from our own browser code; the BFF rejects mutations without it (design 01 §4.3). */
  CLIENT: 'X-Nile-Client',
} as const;

/** How a client reaches the backend: base URL, request options and middleware. */
export interface Transport {
  baseUrl: string;
  credentials?: RequestCredentials;
  fetch?: (request: Request) => Promise<Response>;
  middleware: Middleware[];
}

type Fetch = (request: Request) => Promise<Response>;

const defaultFetch: Fetch = (request) => globalThis.fetch(request);

function setIfAbsent(headers: Headers, name: string, value: string): void {
  if (!headers.has(name)) headers.set(name, value);
}

export interface ServerTransportOptions {
  /** Backend origin without /api/v1 (`NILE_API_BASE_URL`). */
  baseUrl: string;
  /** Session access token; omitted for public calls (design 01 R-6). */
  accessToken?: string;
  /** Correlation id of the incoming request; a new one per call when omitted. */
  correlationId?: string;
  fetch?: Fetch;
}

/** Server side (RSC, route handlers): calls the backend directly with the session's Bearer token. */
export function serverTransport(options: ServerTransportOptions): Transport {
  return {
    baseUrl: options.baseUrl,
    fetch: options.fetch ?? defaultFetch,
    middleware: [
      {
        onRequest({ request }) {
          if (options.accessToken !== undefined) {
            request.headers.set(HEADER.AUTHORIZATION, `Bearer ${options.accessToken}`);
          }
          setIfAbsent(request.headers, HEADER.CORRELATION_ID, options.correlationId ?? crypto.randomUUID());
          return request;
        },
      },
    ],
  };
}

export interface BrowserTransportOptions {
  /** Absolute URL of the app's BFF proxy route, e.g. `${location.origin}/api/bff`. */
  bffBaseUrl: string;
  /**
   * Called once when a call answers 401 UNAUTHENTICATED (expired access token). Resolve `true` after a
   * successful refresh to retry the call once with the same headers and body (same Idempotency-Key);
   * `false` to give up. Wired to the refresh coordinator in T-D2.
   */
  onUnauthenticated?: () => Promise<boolean>;
  fetch?: Fetch;
}

async function isUnauthenticated(response: Response): Promise<boolean> {
  if (response.status !== 401) return false;
  try {
    const body = (await response.clone().json()) as { error?: { code?: unknown } };
    return body.error?.code === 'UNAUTHENTICATED';
  } catch {
    return false;
  }
}

/**
 * Browser side: every call goes to the BFF (`/api/bff/<path without /api/v1>`), never to the backend, and
 * never carries a token (the BFF adds it from the httpOnly session cookie, design 01 §4.2).
 */
export function browserTransport(options: BrowserTransportOptions): Transport {
  const send = options.fetch ?? defaultFetch;
  const base = options.bffBaseUrl.replace(/\/$/, '');
  const prefixed = `${base}${API_PREFIX}`;
  // Untouched copies for the single retry after a refresh, by openapi-fetch request id.
  const originals = new Map<string, Request>();

  return {
    baseUrl: base,
    credentials: 'same-origin',
    fetch: send,
    middleware: [
      {
        onRequest({ request, id }) {
          const url = request.url.startsWith(prefixed)
            ? `${base}${request.url.slice(prefixed.length)}`
            : request.url;
          const rewritten = new Request(url, request);
          rewritten.headers.set(HEADER.CLIENT, '1');
          rewritten.headers.delete(HEADER.AUTHORIZATION);
          setIfAbsent(rewritten.headers, HEADER.CORRELATION_ID, crypto.randomUUID());
          if (options.onUnauthenticated) originals.set(id, rewritten.clone());
          return rewritten;
        },
        async onResponse({ response, id }) {
          const original = originals.get(id);
          originals.delete(id);
          if (!original || !options.onUnauthenticated || !(await isUnauthenticated(response)))
            return undefined;
          const refreshed = await options.onUnauthenticated();
          // The retry goes straight to fetch: it can't trigger another refresh (no loops).
          return refreshed ? send(original) : undefined;
        },
        onError({ id }) {
          originals.delete(id);
        },
      },
    ],
  };
}
