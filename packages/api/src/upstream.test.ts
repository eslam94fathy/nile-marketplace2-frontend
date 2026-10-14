import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApiClient, unwrap } from './client';
import { ApiError } from './errors';
import { serverTransport } from './transports';
import { fetchWithTimeout, forwardToBackend } from './upstream';

const BACKEND = 'http://backend.test';

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

async function failure(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the call to fail');
}

describe('forwardToBackend', () => {
  it('sends method, path below /api/v1, query, headers and body as given, and returns the response untouched', async () => {
    let seen: { url: string; method: string; auth: string | null; body: string } | undefined;
    server.use(
      http.patch(`${BACKEND}/api/v1/cart/items/:itemId`, async ({ request }) => {
        seen = {
          url: request.url,
          method: request.method,
          auth: request.headers.get('Authorization'),
          body: await request.text(),
        };
        return HttpResponse.json(
          { success: true, data: { ok: 1 } },
          { status: 200, headers: { 'X-Extra': 'y' } },
        );
      }),
    );
    const response = await forwardToBackend({
      baseUrl: BACKEND,
      method: 'PATCH',
      path: '/cart/items/6f1c1f8e-2b7a-4c2e-9d55-0d2a1b3c4d5e',
      search: '?a=1&b%5Bin%5D=x,y',
      headers: new Headers({ Authorization: 'Bearer t', 'Content-Type': 'application/json' }),
      body: '{"quantity":2}',
      timeoutMs: 1000,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('X-Extra')).toBe('y');
    expect(await response.json()).toEqual({ success: true, data: { ok: 1 } });
    expect(seen).toEqual({
      url: `${BACKEND}/api/v1/cart/items/6f1c1f8e-2b7a-4c2e-9d55-0d2a1b3c4d5e?a=1&b%5Bin%5D=x,y`,
      method: 'PATCH',
      auth: 'Bearer t',
      body: '{"quantity":2}',
    });
  });

  it('turns a slow backend into UPSTREAM_TIMEOUT', async () => {
    server.use(
      http.get(`${BACKEND}/api/v1/cart`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );
    const error = await failure(
      forwardToBackend({
        baseUrl: BACKEND,
        method: 'GET',
        path: '/cart',
        search: '',
        headers: new Headers(),
        timeoutMs: 20,
      }),
    );
    expect(error.code).toBe('UPSTREAM_TIMEOUT');
    expect(error.status).toBe(0);
  });

  it('turns an unreachable backend into NETWORK_ERROR', async () => {
    server.use(http.get(`${BACKEND}/api/v1/cart`, () => HttpResponse.error()));
    const error = await failure(
      forwardToBackend({
        baseUrl: BACKEND,
        method: 'GET',
        path: '/cart',
        search: '',
        headers: new Headers(),
        timeoutMs: 1000,
      }),
    );
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it("rethrows the caller's own abort as an AbortError", async () => {
    server.use(
      http.get(`${BACKEND}/api/v1/cart`, async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );
    const controller = new AbortController();
    const call = forwardToBackend({
      baseUrl: BACKEND,
      method: 'GET',
      path: '/cart',
      search: '',
      headers: new Headers(),
      timeoutMs: 1000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('fetchWithTimeout with the typed client', () => {
  it('surfaces UPSTREAM_TIMEOUT through unwrap instead of NETWORK_ERROR', async () => {
    server.use(
      http.get(`${BACKEND}/api/v1/governorates`, async () => {
        await delay(200);
        return HttpResponse.json({ success: true, data: [] });
      }),
    );
    const api = createApiClient(serverTransport({ baseUrl: BACKEND, fetch: fetchWithTimeout(20) }));
    const error = await failure(unwrap(api.GET('/api/v1/governorates')));
    expect(error.code).toBe('UPSTREAM_TIMEOUT');
  });
});
