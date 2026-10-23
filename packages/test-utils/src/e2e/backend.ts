// A raw HTTP client for test setup and contract checks. It deliberately bypasses `@nile/api`'s `unwrap`:
// the contract suite must see the exact status and body the backend sent.

export type BackendMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface BackendRequest {
  readonly token?: string;
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  /** Literal query keys (`createdAt[gte]`), scalar values. */
  readonly query?: Readonly<Record<string, string>>;
}

export interface BackendResponse {
  readonly method: BackendMethod;
  /** Path as requested, without the query string (used to name the endpoint in failures). */
  readonly path: string;
  readonly status: number;
  readonly body: unknown;
}

export interface Backend {
  readonly baseUrl: string;
  request(method: BackendMethod, path: string, init?: BackendRequest): Promise<BackendResponse>;
}

const TEST_CLIENT_HEADER = 'X-Nile-Client';
const TEST_CLIENT_NAME = 'nile-web-tests';

export function createBackend(baseUrl: string): Backend {
  return {
    baseUrl,
    async request(method, path, init = {}) {
      const url = new URL(path, baseUrl);
      for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
      const headers = new Headers({ Accept: 'application/json', [TEST_CLIENT_HEADER]: TEST_CLIENT_NAME });
      if (init.token !== undefined) headers.set('Authorization', `Bearer ${init.token}`);
      if (init.idempotencyKey !== undefined) headers.set('Idempotency-Key', init.idempotencyKey);
      if (init.body !== undefined) headers.set('Content-Type', 'application/json');
      const response = await fetch(url, {
        method,
        headers,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      const text = await response.text();
      return {
        method,
        path,
        status: response.status,
        body: text === '' ? undefined : (JSON.parse(text) as unknown),
      };
    },
  };
}

/** `GET /api/v1/x → 404 PRODUCT_NOT_FOUND` style label for failure messages. */
export function describeResponse(response: BackendResponse): string {
  const code = errorCodeOf(response.body);
  return `${response.method} ${response.path} → ${response.status}${code === undefined ? '' : ` ${code}`}`;
}

function errorCodeOf(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  const error = body.error;
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

/** The `data` of a success envelope with the expected status; anything else throws a named error. */
const TOO_MANY_REQUESTS = 429;
const RATE_LIMIT_HINT =
  'the backend limits sign-up/sign-in per IP; for local runs raise RATE_LIMIT_STRICT_AUTH_POINTS in its .env (design 01 §12.3)';

/** Callers assert the type of `data`: the contract suite, not this helper, checks response shapes. */
export function expectData(response: BackendResponse, status: number): unknown {
  if (response.status !== status) {
    const hint = response.status === TOO_MANY_REQUESTS ? `: ${RATE_LIMIT_HINT}` : '';
    throw new Error(`${describeResponse(response)} (expected ${status})${hint}`);
  }
  const body = response.body;
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    throw new Error(`${describeResponse(response)}: no success envelope`);
  }
  return body.data;
}
