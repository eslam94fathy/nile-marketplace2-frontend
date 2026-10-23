import { ApiError, networkError } from './errors';
import { API_PREFIX } from './transports';

// Server-side calls from the apps' BFF to the backend (design 01 §4). The typed client covers the auth routes;
// `forwardToBackend` is the proxy's raw pass-through, kept here so only @nile/api talks HTTP to the backend.

type Fetch = (request: Request) => Promise<Response>;

const defaultFetch: Fetch = (request) => globalThis.fetch(request);

/** The backend didn't answer within the BFF's limit (BFF-only code, retried like a network error). */
export function upstreamTimeout(cause: unknown): ApiError {
  return new ApiError(0, 'UPSTREAM_TIMEOUT', 'The server took too long to answer', [], null, null, { cause });
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

/**
 * Wraps `fetch` so each call is cut off after `timeoutMs` with an `UPSTREAM_TIMEOUT` ApiError. A caller's own
 * abort (e.g. the browser went away) still surfaces as an AbortError.
 */
export function fetchWithTimeout(timeoutMs: number, send: Fetch = defaultFetch): Fetch {
  return async (request) => {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
    try {
      return await send(new Request(request, { signal }));
    } catch (error) {
      if (isTimeout(error)) throw upstreamTimeout(error);
      throw error;
    }
  };
}

export interface ForwardOptions {
  /** Backend origin (`NILE_API_BASE_URL`). */
  baseUrl: string;
  method: string;
  /** Path below `/api/v1`, already checked against the app's allow-list. */
  path: string;
  /** Query string including `?`, or empty. Passed on untouched. */
  search: string;
  headers: Headers;
  body?: string;
  timeoutMs: number;
  /** The incoming request's signal, so a closed browser connection stops the upstream call. */
  signal?: AbortSignal;
  fetch?: Fetch;
}

/**
 * Sends one proxied request to the backend and returns its response as it is (status, headers, body).
 * Throws ApiError `UPSTREAM_TIMEOUT` or `NETWORK_ERROR` when no response arrives; rethrows aborts.
 */
export async function forwardToBackend(options: ForwardOptions): Promise<Response> {
  const url = `${options.baseUrl}${API_PREFIX}${options.path}${options.search}`;
  const request = new Request(url, {
    method: options.method,
    headers: options.headers,
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(options.signal === undefined ? {} : { signal: options.signal }),
    redirect: 'manual',
  });
  try {
    return await fetchWithTimeout(options.timeoutMs, options.fetch)(request);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw networkError(error);
  }
}
