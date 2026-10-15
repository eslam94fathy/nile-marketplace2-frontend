import { inValues, unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The customer's orders (design 02 §2.2 `orders`). T-F3/T-F4 need the detail (SF-08, SF-09) and the newest
// open order (SF-09 fallback); the list with filters comes with T-G3.

export type Order = Schema<'OrderDetailDto'>;
export type OrderSummary = Schema<'OrderSummaryDto'>;

/** Statuses an order can have right after a card payment (spec 01 SF-09 step 2). */
const OPEN_FOR_PAYMENT_RETURN: readonly Order['status'][] = ['pending_payment', 'placed'];

export const orderKeys = {
  /** Prefix of every list (filters come with T-G3). */
  lists: () => queryKey('storefront', 'orders', 'list'),
  detail: (orderId: string) => queryKey('storefront', 'orders', 'detail', { orderId }),
  latestOpen: () => queryKey('storefront', 'orders', 'latestOpen'),
};

/** Never stale: the order moves on as sellers, agents and payments act on it. */
export function orderQuery(orderId: string) {
  return queryOptions({
    queryKey: orderKeys.detail(orderId),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.GET('/api/v1/orders/{orderId}', { params: { path: { orderId } }, signal })))
        .data,
    staleTime: 0,
  });
}

/** `GET /orders?status[in]=pending_payment,placed&limit=1`, newest first: the order a payment return is about. */
export function latestOpenOrderQuery() {
  return queryOptions({
    queryKey: orderKeys.latestOpen(),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/orders', {
            params: {
              query: { 'status[in]': inValues(OPEN_FOR_PAYMENT_RETURN), limit: 1, sort: '-createdAt' },
            },
            signal,
          }),
        )
      ).data[0] ?? null,
    staleTime: 0,
  });
}
