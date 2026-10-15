import { inValues, isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The customer's orders (design 02 §2.2 `orders`): the list (SF-17), the detail (SF-08, SF-09, SF-18) and the
// newest open order (SF-09 fallback).

export type Order = Schema<'OrderDetailDto'>;
export type OrderSummary = Schema<'OrderSummaryDto'>;

/** Statuses an order can have right after a card payment (spec 01 SF-09 step 2). */
const OPEN_FOR_PAYMENT_RETURN: readonly Order['status'][] = ['pending_payment', 'placed'];

export const orderKeys = {
  /** Prefix of every list. */
  lists: () => queryKey('storefront', 'orders', 'list'),
  list: (statuses: readonly Order['status'][] | null) =>
    queryKey('storefront', 'orders', 'list', { status: statuses ?? [] }),
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

/** SF-17 page size (spec 01: `limit=20`). */
export const ORDERS_PAGE_SIZE = 20;

/** `GET /orders`, newest first, optionally limited to some statuses; "Load more" follows the cursor. */
export function ordersListOptions(statuses: readonly Order['status'][] | null) {
  return infiniteListOptions({
    queryKey: orderKeys.list(statuses),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/orders', {
          params: {
            query: {
              limit: ORDERS_PAGE_SIZE,
              sort: '-createdAt',
              ...(statuses === null ? {} : { 'status[in]': inValues(statuses) }),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

/**
 * `GET /orders/{orderId}` failed because there is no such order for this customer: `ORDER_NOT_FOUND`, or
 * `VALIDATION_FAILED` because the id in the URL isn't an order id at all (the backend checks the format
 * first, e.g. a mistyped or cut-off link). Either way the screen is "not found" (spec 01 SF-21), not a
 * retryable failure.
 */
export function isOrderMissing(error: unknown): boolean {
  return isApiError(error, 'ORDER_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}
