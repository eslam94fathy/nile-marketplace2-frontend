import { inValues, isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { isTerminal } from './lib/order-math';
import type { OrderTab } from './lib/tabs';

// Seller orders (design 02 §2.3 `orders.*`, `overview.*`; §3.3 mutations). Polling every 60 s only while
// the tab is visible (spec 02 §6, api-inventory §10.4): TanStack pauses intervals in background tabs.

export type SellerOrder = Schema<'SellerOrderDto'>;
export type SellerOrderItem = Schema<'OrderItemDto'>;
export type OverviewQueue = 'toConfirm' | 'returns';

export const ORDERS_POLL_MS = 60_000;
const ORDERS_PAGE_SIZE = 20;
const OVERVIEW_SIZE = 5;

export const orderKeys = {
  lists: () => queryKey('seller', 'orders', 'list'),
  list: (tab: string) => queryKey('seller', 'orders', 'list', { tab }),
  detail: (sellerOrderId: string) => queryKey('seller', 'orders', 'detail', { sellerOrderId }),
  overview: () => queryKey('seller', 'overview', 'orders'),
  overviewQueue: (queue: OverviewQueue) => queryKey('seller', 'overview', 'orders', { queue }),
};

/** SE-14: one tab, 20 per page, polled. */
export function ordersListOptions(tab: OrderTab) {
  return {
    ...infiniteListOptions({
      queryKey: orderKeys.list(tab.key),
      fetchPage: async (cursor, signal) =>
        unwrap(
          browserApi.GET('/api/v1/seller/orders', {
            params: {
              query: {
                limit: ORDERS_PAGE_SIZE,
                sort: tab.sort,
                ...(tab.statuses === null ? {} : { 'status[in]': inValues(tab.statuses) }),
                ...(cursor === undefined ? {} : { cursor }),
              },
            },
            signal,
          }),
        ),
    }),
    refetchInterval: ORDERS_POLL_MS,
  };
}

/** SE-06 queues: the 5 oldest orders to confirm, and returns to confirm (design 02 §2.3). */
const OVERVIEW_STATUS = { toConfirm: 'placed', returns: 'returning_to_seller' } as const;

export function overviewQueueQuery(queue: OverviewQueue) {
  return queryOptions({
    queryKey: orderKeys.overviewQueue(queue),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/seller/orders', {
            params: {
              query: { limit: OVERVIEW_SIZE, sort: 'createdAt', 'status[eq]': OVERVIEW_STATUS[queue] },
            },
            signal,
          }),
        )
      ).data,
    refetchInterval: ORDERS_POLL_MS,
  });
}

/** SE-15: stale 0, refetch on focus, every 60 s while visible until the order can't change any more. */
export function orderQuery(sellerOrderId: string) {
  return queryOptions({
    queryKey: orderKeys.detail(sellerOrderId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/seller/orders/{sellerOrderId}', {
            params: { path: { sellerOrderId } },
            signal,
          }),
        )
      ).data,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: (query) =>
      query.state.data !== undefined && isTerminal(query.state.data.status) ? false : ORDERS_POLL_MS,
  });
}

/** Not this seller's order, or not an order id at all (the backend checks the format first, as R-36). */
export function isSellerOrderMissing(error: unknown): boolean {
  return isApiError(error, 'SELLER_ORDER_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const path = (sellerOrderId: string) => ({ path: { sellerOrderId } });
const keyed = (sellerOrderId: string, key: string) => ({
  path: { sellerOrderId },
  header: { 'Idempotency-Key': key },
});

/** A1: the API takes no idempotency key, so it is never retried. */
export async function acceptOrder(sellerOrderId: string): Promise<SellerOrder> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/orders/{sellerOrderId}/accept', { params: path(sellerOrderId) }),
    )
  ).data;
}

/** A2: the API takes no idempotency key, so it is never retried. */
export async function markReady(sellerOrderId: string): Promise<SellerOrder> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/orders/{sellerOrderId}/ready', { params: path(sellerOrderId) }),
    )
  ).data;
}

export interface CancelOrderVariables {
  readonly sellerOrderId: string;
  readonly note: string | null;
}

/** A3, idempotent. An empty note is omitted, never `null`. */
export async function cancelOrder(
  { sellerOrderId, note }: CancelOrderVariables,
  key: string,
): Promise<SellerOrder> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/orders/{sellerOrderId}/cancel', {
        params: keyed(sellerOrderId, key),
        body: note === null ? {} : { note },
      }),
    )
  ).data;
}

export interface CancelItemVariables {
  readonly sellerOrderId: string;
  readonly itemId: string;
  readonly body: Schema<'CancelOrderItemDto'>;
}

/** A4, idempotent. */
export async function cancelItem(
  { sellerOrderId, itemId, body }: CancelItemVariables,
  key: string,
): Promise<SellerOrder> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/orders/{sellerOrderId}/items/{itemId}/cancel', {
        params: { path: { sellerOrderId, itemId }, header: { 'Idempotency-Key': key } },
        body,
      }),
    )
  ).data;
}

/** A5, idempotent. */
export async function confirmReturn({ sellerOrderId }: { readonly sellerOrderId: string }, key: string) {
  return (
    await unwrap(
      browserApi.POST('/api/v1/seller/orders/{sellerOrderId}/return-received', {
        params: keyed(sellerOrderId, key),
      }),
    )
  ).data;
}
