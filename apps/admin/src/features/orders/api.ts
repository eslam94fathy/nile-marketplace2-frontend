import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { orderApiQuery, type OrderFilters } from './lib/list-params';

// Orders (spec 03 AD-14, AD-15; design 02 §2.4 `orders.*`). Read-only: no admin cancellation in R1 (S-9).

export type AdminOrderSummary = Schema<'AdminOrderSummaryDto'>;
export type AdminOrder = Schema<'AdminOrderDetailDto'>;
export type AdminSellerOrder = AdminOrder['sellerOrders'][number];
export type HistoryEntry = AdminOrder['statusHistory'][number];

const ORDERS_PAGE_SIZE = 20;

export const orderKeys = {
  lists: () => queryKey('admin', 'orders', 'list'),
  list: (filters: OrderFilters) => queryKey('admin', 'orders', 'list', filters),
  detail: (orderId: string) => queryKey('admin', 'orders', 'detail', { orderId }),
  shipments: (orderId: string) => queryKey('admin', 'shipments', 'list', { orderId }),
  dashboard: () => queryKey('admin', 'dashboard', 'awaitingCardPayment'),
};

export function ordersListOptions(filters: OrderFilters) {
  return infiniteListOptions({
    queryKey: orderKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/orders', {
          params: {
            query: {
              limit: ORDERS_PAGE_SIZE,
              ...orderApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

/** AD-15: stale 0 (design 02 §2.4). */
export function orderQuery(orderId: string) {
  return queryOptions({
    queryKey: orderKeys.detail(orderId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/orders/{orderId}', { params: { path: { orderId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/** An order has one shipment per seller order: one page covers them all. */
const ORDER_SHIPMENTS_LIMIT = 100;

/** AD-15: the order's shipments, to link each seller order to its AD-13. */
export function orderShipmentsQuery(orderId: string) {
  return queryOptions({
    queryKey: orderKeys.shipments(orderId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/shipments', {
            params: { query: { limit: ORDER_SHIPMENTS_LIMIT, sort: 'createdAt', 'orderId[eq]': orderId } },
            signal,
          }),
        )
      ).data,
    staleTime: 0,
  });
}

/** No such order, or not an order id at all (the backend checks the id format first, as R-36). */
export function isOrderMissing(error: unknown): boolean {
  return isApiError(error, 'ORDER_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}
