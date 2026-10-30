import { mockApi, orderDetailFactory } from '@nile/test-utils';
import { describe, expect, it } from 'vitest';
import { BFF_BASE, setupMswServer } from '@/test/msw';
import { loadOrderChoices, ORDER_CHOICES_LIMIT } from './api';

const server = setupMswServer();
const PAGE = { nextCursor: null, hasMore: false, limit: ORDER_CHOICES_LIMIT };
const signal = new AbortController().signal;

const recent = orderDetailFactory({ id: 'o-recent', orderNumber: '2026-000200' });
const older = orderDetailFactory({ id: 'o-older', orderNumber: '2026-000100' });
/** `GET /orders` answers summaries. */
const SUMMARY = {
  id: recent.id,
  orderNumber: recent.orderNumber,
  status: recent.status,
  paymentMethod: recent.paymentMethod,
  total: recent.total,
  itemCount: 1,
  sellerOrderCount: 1,
  createdAt: recent.createdAt,
};

function serve(detail: 'ok' | 'missing' = 'ok') {
  const queries: URLSearchParams[] = [];
  server.use(
    mockApi(
      'get',
      '/orders',
      ({ request, reply }) => {
        queries.push(new URL(request.url).searchParams);
        return reply.ok([SUMMARY], PAGE);
      },
      { base: BFF_BASE },
    ),
    mockApi(
      'get',
      '/orders/{orderId}',
      ({ reply }) => (detail === 'ok' ? reply.ok(older) : reply.error(404, 'ORDER_NOT_FOUND')),
      { base: BFF_BASE },
    ),
  );
  return queries;
}

describe('SF-30 order choices', () => {
  it('the latest orders, newest first', async () => {
    const queries = serve();
    expect(await loadOrderChoices(null, signal)).toEqual([{ id: 'o-recent', orderNumber: '2026-000200' }]);
    expect(queries[0]?.get('limit')).toBe(String(ORDER_CHOICES_LIMIT));
    expect(queries[0]?.get('sort')).toBe('-createdAt');
  });

  it('an older order from the URL comes first, with its parcels named by seller', async () => {
    serve();
    const choices = await loadOrderChoices('o-older', signal);
    expect(choices.map((choice) => choice.id)).toEqual(['o-older', 'o-recent']);
    expect(choices[0]?.sellers).toEqual(
      older.sellerOrders.map((sellerOrder) => ({
        sellerOrderId: sellerOrder.id,
        businessName: sellerOrder.businessName,
      })),
    );
  });

  it('an order from the URL that is not the customer’s is simply not offered', async () => {
    serve('missing');
    expect(await loadOrderChoices('o-other', signal)).toEqual([
      { id: 'o-recent', orderNumber: '2026-000200' },
    ]);
  });
});
