import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApiClient, unwrap } from './client';
import { ApiError, isApiError } from './errors';
import { productQuery } from './query';
import { browserTransport, serverTransport } from './transports';

const BACKEND = 'http://backend.test';
const BFF = 'http://app.test/api/bff';
const CORRELATION = '0b0e0f53-6f5a-4c43-9c39-9d1b1e0a2f10';

const server = setupServer();
beforeAll(() => {
  // MSW 3: any request without a handler fails the test.
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const api = createApiClient(
  serverTransport({ baseUrl: BACKEND, accessToken: 'access-1', correlationId: CORRELATION }),
);
const publicApi = createApiClient(serverTransport({ baseUrl: BACKEND }));

const errorBody = (code: string, extra: Record<string, unknown> = {}) => ({
  success: false,
  error: { code, message: `${code} message`, ...extra },
  correlationId: CORRELATION,
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

describe('unwrap — success', () => {
  it('returns data and list meta; sends literal query keys, Bearer token and correlation id', async () => {
    let seen: Request | undefined;
    server.use(
      http.get(`${BACKEND}/api/v1/products`, ({ request }) => {
        seen = request;
        return HttpResponse.json({
          success: true,
          data: [{ id: 'p1' }],
          meta: { nextCursor: 'c2', hasMore: true, limit: 20 },
        });
      }),
    );

    const { data, meta } = await unwrap(
      api.GET('/api/v1/products', {
        params: {
          query: productQuery({
            'categoryId[eq]': '01a125e5-0e14-763a-a68f-005e0439cf6c',
            'inStock[eq]': true,
            limit: 20,
            sort: '-publishedAt',
            attributes: { color: ['red', 'blue'] },
          }),
        },
      }),
    );

    expect(data).toEqual([{ id: 'p1' }]);
    expect(meta).toEqual({ nextCursor: 'c2', hasMore: true, limit: 20 });
    const url = new URL(seen?.url ?? '');
    expect([...url.searchParams.entries()]).toEqual([
      ['categoryId[eq]', '01a125e5-0e14-763a-a68f-005e0439cf6c'],
      ['inStock[eq]', 'true'],
      ['limit', '20'],
      ['sort', '-publishedAt'],
      ['attr.color[in]', 'red,blue'],
    ]);
    expect(seen?.headers.get('Authorization')).toBe('Bearer access-1');
    expect(seen?.headers.get('X-Correlation-Id')).toBe(CORRELATION);
  });

  it('returns a single resource without meta and sends no token on public clients', async () => {
    let authorization: string | null = 'unset';
    server.use(
      http.get(`${BACKEND}/api/v1/products/:idOrSlug`, ({ request, params }) => {
        authorization = request.headers.get('Authorization');
        return HttpResponse.json({ success: true, data: { slug: params.idOrSlug } });
      }),
    );
    const { data, meta } = await unwrap(
      publicApi.GET('/api/v1/products/{idOrSlug}', { params: { path: { idOrSlug: 'blue-shirt-ab12cd' } } }),
    );
    expect(data).toEqual({ slug: 'blue-shirt-ab12cd' });
    expect(meta).toBeUndefined();
    expect(authorization).toBeNull();
  });

  it('generates a correlation id per call when none is given', async () => {
    const ids: (string | null)[] = [];
    server.use(
      http.get(`${BACKEND}/api/v1/governorates`, ({ request }) => {
        ids.push(request.headers.get('X-Correlation-Id'));
        return HttpResponse.json({ success: true, data: [] });
      }),
    );
    await unwrap(publicApi.GET('/api/v1/governorates'));
    await unwrap(publicApi.GET('/api/v1/governorates'));
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('returns no data for 204', async () => {
    server.use(http.delete(`${BACKEND}/api/v1/cart`, () => new HttpResponse(null, { status: 204 })));
    await expect(unwrap(api.DELETE('/api/v1/cart'))).resolves.toEqual({ data: undefined, meta: undefined });
  });

  it('sends the Idempotency-Key and the body', async () => {
    let key: string | null = null;
    let body: unknown;
    server.use(
      http.post(`${BACKEND}/api/v1/checkout`, async ({ request }) => {
        key = request.headers.get('Idempotency-Key');
        body = await request.json();
        return HttpResponse.json(
          { success: true, data: { order: { id: 'o1' }, kashier: null } },
          { status: 201 },
        );
      }),
    );
    const idempotencyKey = '6f1c7a52-2c4a-4d8e-9a8b-3c0d2f1e4b5a';
    const checkout = {
      addressId: '01a1355e-a46d-7a8f-8296-3b62939b442c',
      paymentMethod: 'cod',
      expectedTotal: '115.00',
    } as const;
    await unwrap(
      api.POST('/api/v1/checkout', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body: checkout,
      }),
    );
    expect(key).toBe(idempotencyKey);
    expect(body).toEqual(checkout);
  });

  it('makes the Idempotency-Key mandatory at compile time', () => {
    const call = () =>
      // @ts-expect-error -- POST /checkout requires params.header['Idempotency-Key'] (generated from the spec)
      api.POST('/api/v1/checkout', { body: { addressId: 'a', paymentMethod: 'cod', expectedTotal: '1.00' } });
    expect(typeof call).toBe('function');
  });
});

describe('unwrap — failures', () => {
  it('maps a validation error with details and correlation id', async () => {
    const details = [{ field: 'pickupAddress.city', constraint: 'length', message: 'too long' }];
    server.use(
      http.post(`${BACKEND}/api/v1/auth/login`, () =>
        HttpResponse.json(errorBody('VALIDATION_FAILED', { details }), { status: 400 }),
      ),
    );
    const error = await failure(
      unwrap(publicApi.POST('/api/v1/auth/login', { body: { email: 'a@b.c', password: 'x' } })),
    );
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      details,
      correlationId: CORRELATION,
    });
    expect(isApiError(error, 'VALIDATION_FAILED')).toBe(true);
    expect(isApiError(error, 'UNAUTHENTICATED')).toBe(false);
  });

  it.each([
    [401, 'UNAUTHENTICATED'],
    [403, 'FORBIDDEN'],
    [404, 'PRODUCT_NOT_FOUND'],
    [409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS'],
    [413, 'PAYLOAD_TOO_LARGE'],
    [422, 'IDEMPOTENCY_KEY_REUSED'],
    [500, 'INTERNAL_ERROR'],
    [503, 'SERVICE_UNAVAILABLE'],
  ])('maps HTTP %i %s', async (status, code) => {
    server.use(
      http.get(`${BACKEND}/api/v1/governorates`, () => HttpResponse.json(errorBody(code), { status })),
    );
    const error = await failure(unwrap(publicApi.GET('/api/v1/governorates')));
    expect(error).toMatchObject({ status, code, message: `${code} message`, details: [] });
  });

  it('reads Retry-After in seconds', async () => {
    server.use(
      http.get(`${BACKEND}/api/v1/governorates`, () =>
        HttpResponse.json(errorBody('RATE_LIMITED'), { status: 429, headers: { 'Retry-After': '30' } }),
      ),
    );
    const error = await failure(unwrap(publicApi.GET('/api/v1/governorates')));
    expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfterSeconds: 30 });
  });

  it('falls back to the correlation header when the body has none', async () => {
    server.use(
      http.get(`${BACKEND}/api/v1/governorates`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'x' } },
          { status: 500, headers: { 'X-Correlation-Id': 'from-header' } },
        ),
      ),
    );
    expect((await failure(unwrap(publicApi.GET('/api/v1/governorates')))).correlationId).toBe('from-header');
  });

  it('treats a non-envelope error page as NETWORK_ERROR and keeps the status', async () => {
    server.use(
      http.get(`${BACKEND}/api/v1/governorates`, () =>
        HttpResponse.text('<html>Bad gateway</html>', {
          status: 502,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );
    expect(await failure(unwrap(publicApi.GET('/api/v1/governorates')))).toMatchObject({
      status: 502,
      code: 'NETWORK_ERROR',
    });
  });

  it('treats malformed JSON on success as NETWORK_ERROR', async () => {
    server.use(
      http.get(`${BACKEND}/api/v1/governorates`, () =>
        HttpResponse.text('{"success": tru', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    expect((await failure(unwrap(publicApi.GET('/api/v1/governorates')))).code).toBe('NETWORK_ERROR');
  });

  it('treats a network failure as NETWORK_ERROR with status 0', async () => {
    server.use(http.get(`${BACKEND}/api/v1/governorates`, () => HttpResponse.error()));
    expect(await failure(unwrap(publicApi.GET('/api/v1/governorates')))).toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('rethrows aborts untouched (query cancellation)', async () => {
    server.use(
      http.get(`${BACKEND}/api/v1/governorates`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return HttpResponse.json({ success: true, data: [] });
      }),
    );
    const controller = new AbortController();
    const call = unwrap(publicApi.GET('/api/v1/governorates', { signal: controller.signal }));
    controller.abort();
    await expect(call).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('browserTransport', () => {
  const unauthenticated = () => HttpResponse.json(errorBody('UNAUTHENTICATED'), { status: 401 });

  it('calls the BFF without /api/v1, marks the request, and never sends a token', async () => {
    let seen: Request | undefined;
    server.use(
      http.get(`${BFF}/products`, ({ request }) => {
        seen = request;
        return HttpResponse.json({
          success: true,
          data: [],
          meta: { nextCursor: null, hasMore: false, limit: 20 },
        });
      }),
    );
    const client = createApiClient(browserTransport({ bffBaseUrl: BFF }));
    await unwrap(client.GET('/api/v1/products', { params: { query: { q: 'shirt' } } }));
    expect(seen?.url).toBe(`${BFF}/products?q=shirt`);
    expect(seen?.headers.get('X-Nile-Client')).toBe('1');
    expect(seen?.headers.get('Authorization')).toBeNull();
    expect(seen?.headers.get('X-Correlation-Id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refreshes once on UNAUTHENTICATED and retries with the same key and body', async () => {
    const attempts: { key: string | null; body: unknown }[] = [];
    server.use(
      http.post(`${BFF}/checkout`, async ({ request }) => {
        attempts.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
        return attempts.length === 1
          ? unauthenticated()
          : HttpResponse.json(
              { success: true, data: { order: { id: 'o1' }, kashier: null } },
              { status: 201 },
            );
      }),
    );
    const onUnauthenticated = vi.fn(() => Promise.resolve(true));
    const client = createApiClient(browserTransport({ bffBaseUrl: BFF, onUnauthenticated }));
    const body = { addressId: 'a1', paymentMethod: 'cod', expectedTotal: '10.00' } as const;
    const { data } = await unwrap(
      client.POST('/api/v1/checkout', { params: { header: { 'Idempotency-Key': 'key-1' } }, body }),
    );
    expect(data).toEqual({ order: { id: 'o1' }, kashier: null });
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(attempts).toEqual([
      { key: 'key-1', body },
      { key: 'key-1', body },
    ]);
  });

  it('retries only once: a second UNAUTHENTICATED is returned as an error', async () => {
    let calls = 0;
    server.use(
      http.get(`${BFF}/me`, () => {
        calls += 1;
        return unauthenticated();
      }),
    );
    const onUnauthenticated = vi.fn(() => Promise.resolve(true));
    const client = createApiClient(browserTransport({ bffBaseUrl: BFF, onUnauthenticated }));
    expect((await failure(unwrap(client.GET('/api/v1/me')))).code).toBe('UNAUTHENTICATED');
    expect(calls).toBe(2);
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the refresh fails', async () => {
    let calls = 0;
    server.use(
      http.get(`${BFF}/me`, () => {
        calls += 1;
        return unauthenticated();
      }),
    );
    const client = createApiClient(
      browserTransport({ bffBaseUrl: BFF, onUnauthenticated: () => Promise.resolve(false) }),
    );
    expect((await failure(unwrap(client.GET('/api/v1/me')))).code).toBe('UNAUTHENTICATED');
    expect(calls).toBe(1);
  });

  it('does not refresh for other 401 codes', async () => {
    server.use(
      http.post(`${BFF}/auth/password/reset`, () =>
        HttpResponse.json(errorBody('INVALID_REFRESH_TOKEN'), { status: 401 }),
      ),
    );
    const onUnauthenticated = vi.fn(() => Promise.resolve(true));
    const client = createApiClient(browserTransport({ bffBaseUrl: BFF, onUnauthenticated }));
    const error = await failure(
      unwrap(
        client.POST('/api/v1/auth/password/reset', {
          body: { email: 'a@b.c', otp: '123456', newPassword: 'long-enough' },
        }),
      ),
    );
    expect(error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});
