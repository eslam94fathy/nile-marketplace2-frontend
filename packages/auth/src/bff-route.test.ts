import type { BffApp } from '@nile/api';
import { governorateFactory, mockApi } from '@nile/test-utils';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AuthAppConfig } from './config';
import { createBffRouteHandler } from './route-handlers';
import {
  makeRequest,
  sessionCookie,
  setCookies,
  testConfig,
  tokensFor,
  type RequestInit,
} from './test/fixtures';

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const BACKEND = 'http://backend.test/api/v1';
const ITEM_ID = '6f1c1f8e-2b7a-4c2e-9d55-0d2a1b3c4d5e';
const CORRELATION = '7d0c2a43-29c8-4a8a-8a43-0e5b2f6a9e11';
const IDEMPOTENCY_KEY = '3b8a3f8e-8f62-4a8e-9a6e-2f0f5f1d9c01';

function setup(app: BffApp = 'storefront', overrides: Partial<AuthAppConfig> = {}) {
  const { config, logs } = testConfig(app, overrides);
  const handlers = createBffRouteHandler(() => config);
  const call = (path: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET') as keyof typeof handlers;
    return handlers[method](makeRequest(`/api/bff${path}`, { ...init, method }));
  };
  return { call, logs };
}

const code = async (response: Response) =>
  ((await response.json()) as { error: { code: string } }).error.code;

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** Records what reached the backend for any method and path. */
function recordBackend(
  status = 200,
  body: Record<string, unknown> = { success: true, data: {} },
  headers: Record<string, string> = {},
) {
  const seen: Seen[] = [];
  server.use(
    http.all(`${BACKEND}/*`, async ({ request }) => {
      seen.push({
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: await request.text(),
      });
      return status === 204
        ? new HttpResponse(null, { status, headers })
        : HttpResponse.json(body, { status, headers });
    }),
  );
  return seen;
}

describe('BFF proxy: allow-list', () => {
  it('answers 404 ROUTE_NOT_FOUND for a path outside the app’s allow-list, without calling the backend', async () => {
    const seen = recordBackend();
    for (const path of [
      '/admin/sellers',
      '/auth/login',
      '/seller/products',
      '/cart/',
      `/orders/not-an-id`,
      '/nope',
    ]) {
      const response = await setup().call(path);
      expect(response.status, path).toBe(404);
      expect(await code(response)).toBe('ROUTE_NOT_FOUND');
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(seen).toEqual([]);
  });

  it('answers 404 for an allowed path with a method that is not allowed', async () => {
    const seen = recordBackend();
    const response = await setup().call('/cart', { method: 'PUT', body: '{}' });
    expect(response.status).toBe(404);
    expect(seen).toEqual([]);
  });

  it('never proxies the token-bearing auth calls', async () => {
    const seen = recordBackend();
    for (const path of [
      '/auth/login',
      '/auth/refresh',
      '/auth/logout',
      '/auth/email/verify',
      '/auth/invite/accept',
    ]) {
      const response = await setup().call(path, { method: 'POST', body: '{}' });
      expect(response.status, path).toBe(404);
    }
    expect(seen).toEqual([]);
  });
});

describe('BFF proxy: CSRF', () => {
  it.each([
    ['without Origin', { crossSite: true }],
    ['from another origin', { headers: { Origin: 'http://evil.test' } }],
    ['without X-Nile-Client', { crossSite: true, headers: { Origin: 'http://app.test' } }],
  ] satisfies [string, RequestInit][])('rejects a mutation %s with 403 CSRF_REJECTED', async (_, init) => {
    const seen = recordBackend();
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const response = await setup().call('/cart/items', { ...init, method, body: '{}' });
      expect(response.status, method).toBe(403);
      expect(await code(response)).toBe('CSRF_REJECTED');
    }
    expect(seen).toEqual([]);
  });

  it('does not require the CSRF headers on GET', async () => {
    server.use(mockApi('get', '/governorates', ({ reply }) => reply.ok([governorateFactory()])));
    const response = await setup().call('/governorates', { crossSite: true });
    expect(response.status).toBe(200);
  });
});

describe('BFF proxy: session', () => {
  it('answers 401 UNAUTHENTICATED for a Bearer operation without a session', async () => {
    const seen = recordBackend();
    const response = await setup().call('/cart');
    expect(response.status).toBe(401);
    expect(await code(response)).toBe('UNAUTHENTICATED');
    expect(seen).toEqual([]);
  });

  it('answers 401 without calling the backend once the access token has expired', async () => {
    const seen = recordBackend();
    const cookie = await sessionCookie('storefront', tokensFor('storefront'));
    const response = await setup('storefront', { now: () => new Date('2026-10-14T08:15:00.000Z') }).call(
      '/cart',
      {
        cookie,
      },
    );
    expect(response.status).toBe(401);
    expect(await code(response)).toBe('UNAUTHENTICATED');
    expect(seen).toEqual([]);
  });

  it('clears an unreadable session cookie', async () => {
    const response = await setup().call('/cart', { cookie: '__Host-nile_storefront_session=tampered' });
    expect(response.status).toBe(401);
    expect(setCookies(response).every((c) => c.attributes.includes('Max-Age=0'))).toBe(true);
  });

  it('adds the Bearer token from the session for Bearer operations', async () => {
    const tokens = tokensFor('storefront');
    const seen = recordBackend();
    const response = await setup().call('/cart', { cookie: await sessionCookie('storefront', tokens) });
    expect(response.status).toBe(200);
    expect(seen[0]?.headers.authorization).toBe(`Bearer ${tokens.accessToken}`);
  });

  it('sends public operations without a token even when signed in (R-6)', async () => {
    const seen = recordBackend();
    const response = await setup().call('/products?limit=10', {
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(200);
    expect(seen[0]?.headers.authorization).toBeUndefined();
  });
});

describe('BFF proxy: forwarding', () => {
  it('forwards method, path, query and JSON body, and only the allowed request headers', async () => {
    const tokens = tokensFor('storefront');
    const seen = recordBackend();
    const cookie = await sessionCookie('storefront', tokens);
    await setup().call(`/cart/items/${ITEM_ID}?x=1&createdAt%5Bgte%5D=2026-01-01`, {
      method: 'PATCH',
      body: '{"quantity":2}',
      cookie,
      headers: {
        'X-Correlation-Id': CORRELATION,
        'Idempotency-Key': IDEMPOTENCY_KEY,
        Accept: 'application/json',
        Authorization: 'Bearer forged',
        'X-Forwarded-For': '1.2.3.4',
        'X-Custom': 'nope',
      },
    });
    expect(seen).toHaveLength(1);
    const [request] = seen;
    expect(request?.url).toBe(`${BACKEND}/cart/items/${ITEM_ID}?x=1&createdAt%5Bgte%5D=2026-01-01`);
    expect(request?.method).toBe('PATCH');
    expect(request?.body).toBe('{"quantity":2}');
    expect(request?.headers).toMatchObject({
      accept: 'application/json',
      authorization: `Bearer ${tokens.accessToken}`,
      'content-type': 'application/json',
      'idempotency-key': IDEMPOTENCY_KEY,
      'x-correlation-id': CORRELATION,
    });
    // Node's fetch adds its own defaults (user-agent, accept-encoding, …); none of the browser's others pass.
    for (const name of ['cookie', 'origin', 'x-nile-client', 'x-forwarded-for', 'x-custom', 'referer']) {
      expect(request?.headers, name).not.toHaveProperty(name);
    }
  });

  it('generates a correlation id when the browser sends none or an invalid one', async () => {
    const seen = recordBackend();
    await setup().call('/governorates', { headers: { 'X-Correlation-Id': 'forged" level="fatal' } });
    await setup().call('/governorates');
    for (const request of seen) {
      expect(request.headers['x-correlation-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
    expect(seen).toHaveLength(2);
  });

  it('passes status and body through with only the allowed response headers, never cached', async () => {
    const body = {
      success: false,
      error: { code: 'CART_ITEM_NOT_FOUND', message: 'x' },
      correlationId: CORRELATION,
    };
    recordBackend(404, body, {
      'X-Correlation-Id': CORRELATION,
      'Retry-After': '5',
      'Idempotent-Replayed': 'true',
      'Set-Cookie': 'backend=1',
      'X-Powered-By': 'Express',
      'Cache-Control': 'public, max-age=60',
    });
    const response = await setup().call(`/cart/items/${ITEM_ID}`, {
      method: 'DELETE',
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual(body);
    expect(Object.fromEntries(response.headers.entries())).toEqual({
      'cache-control': 'no-store',
      'content-type': 'application/json',
      'idempotent-replayed': 'true',
      'retry-after': '5',
      'x-correlation-id': CORRELATION,
    });
  });

  it('passes 204 through without a body', async () => {
    recordBackend(204);
    const response = await setup().call('/cart', {
      method: 'DELETE',
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('rejects an oversized body with 413 and a non-JSON body with 415, without calling the backend', async () => {
    const seen = recordBackend();
    const cookie = await sessionCookie('storefront', tokensFor('storefront'));
    const large = await setup().call('/cart/items', {
      method: 'POST',
      cookie,
      body: JSON.stringify({ x: 'y'.repeat(2000) }),
    });
    expect(large.status).toBe(413);
    expect(await code(large)).toBe('PAYLOAD_TOO_LARGE');
    const form = await setup().call('/cart/items', {
      method: 'POST',
      cookie,
      body: 'a=b',
      headers: { 'Content-Type': 'text/plain' },
    });
    expect(form.status).toBe(415);
    expect(await code(form)).toBe('VALIDATION_FAILED');
    expect(seen).toEqual([]);
  });

  it('forwards a POST without a body as such', async () => {
    const seen = recordBackend();
    const response = await setup('seller').call(`/seller/orders/${ITEM_ID}/accept`, {
      method: 'POST',
      cookie: await sessionCookie('seller', tokensFor('seller')),
    });
    expect(response.status).toBe(200);
    expect(seen[0]?.body).toBe('');
  });

  it('answers 504 UPSTREAM_TIMEOUT and 502 NETWORK_ERROR when the backend does not answer', async () => {
    server.use(
      http.get(`${BACKEND}/governorates`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );
    const slow = await setup('storefront', { upstreamTimeoutMs: 20 }).call('/governorates');
    expect(slow.status).toBe(504);
    expect(await code(slow)).toBe('UPSTREAM_TIMEOUT');

    server.use(http.get(`${BACKEND}/governorates`, () => HttpResponse.error()));
    const down = await setup().call('/governorates');
    expect(down.status).toBe(502);
    expect(await code(down)).toBe('NETWORK_ERROR');
  });
});

describe('BFF proxy: logging', () => {
  it('logs one line per request with the path template and user id, never tokens, bodies or query values', async () => {
    const tokens = tokensFor('storefront');
    recordBackend();
    const { call, logs } = setup();
    await call(`/me/addresses/${ITEM_ID}?secret=query-value`, {
      method: 'PATCH',
      body: '{"street":"1 Nile Street","phone":"+201001234567"}',
      cookie: await sessionCookie('storefront', tokens),
      headers: { 'X-Correlation-Id': CORRELATION },
    });
    expect(logs).toHaveLength(1);
    const line = JSON.parse(logs[0] ?? '{}') as Record<string, unknown>;
    expect(line).toMatchObject({
      level: 'info',
      message: 'BFF request',
      method: 'PATCH',
      route: 'PATCH /me/addresses/{addressId}',
      status: 200,
      correlationId: CORRELATION,
      userId: tokens.user.id,
    });
    for (const secret of [
      tokens.accessToken,
      tokens.refreshToken,
      'Nile Street',
      '+2010',
      'query-value',
      ITEM_ID,
    ]) {
      expect(logs[0]).not.toContain(secret);
    }
  });
});
