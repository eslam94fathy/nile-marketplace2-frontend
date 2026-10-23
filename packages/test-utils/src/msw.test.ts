import { createApiClient, isApiError, serverTransport, unwrap } from '@nile/api';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { governorateFactory } from './factories/governorate';
import { mockApi, TEST_API_ORIGIN, toMswPath } from './msw';

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

const api = createApiClient(serverTransport({ baseUrl: TEST_API_ORIGIN }));

describe('mockApi', () => {
  it('answers a typed success envelope the real client unwraps', async () => {
    const cairo = governorateFactory({ name: 'Cairo' });
    server.use(mockApi('get', '/governorates', ({ reply }) => reply.ok([cairo])));
    const { data } = await unwrap(api.GET('/api/v1/governorates'));
    expect(data).toEqual([cairo]);
  });

  it('passes path parameters to the resolver', async () => {
    let seenId: unknown;
    server.use(
      mockApi('get', '/categories/{categoryId}/attributes', ({ params, reply }) => {
        seenId = params.categoryId;
        return reply.ok([]);
      }),
    );
    await unwrap(
      api.GET('/api/v1/categories/{categoryId}/attributes', { params: { path: { categoryId: 'c-1' } } }),
    );
    expect(seenId).toBe('c-1');
  });

  it('answers error envelopes the client turns into ApiError', async () => {
    server.use(mockApi('get', '/products/{idOrSlug}', ({ reply }) => reply.error(404, 'PRODUCT_NOT_FOUND')));
    const call = unwrap(api.GET('/api/v1/products/{idOrSlug}', { params: { path: { idOrSlug: 'x' } } }));
    await expect(call).rejects.toSatisfy((error: unknown) => isApiError(error, 'PRODUCT_NOT_FOUND'));
  });

  it('answers 204 without a body', async () => {
    server.use(mockApi('delete', '/cart/items/{itemId}', ({ reply }) => reply.noContent()));
    const response = await fetch(`${TEST_API_ORIGIN}/api/v1/cart/items/i-1`, { method: 'DELETE' });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
  });

  it('mocks a BFF base for browser code', async () => {
    const BFF = 'http://app.test/api/bff';
    server.use(mockApi('get', '/governorates', ({ reply }) => reply.ok([]), { base: BFF }));
    const response = await fetch(`${BFF}/governorates`);
    expect(await response.json()).toEqual({ success: true, data: [] });
  });

  it('converts OpenAPI path templates to MSW parameters', () => {
    expect(toMswPath('/orders/{orderId}/seller-orders/{sellerOrderId}')).toBe(
      '/orders/:orderId/seller-orders/:sellerOrderId',
    );
  });
});

describe('defineFactory', () => {
  it('builds unique valid DTOs and applies overrides', () => {
    const first = governorateFactory();
    const second = governorateFactory({ deliveryFee: null, isDeliverable: false });
    expect(first.id).not.toBe(second.id);
    expect(second).toMatchObject({ deliveryFee: null, isDeliverable: false });
    expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
