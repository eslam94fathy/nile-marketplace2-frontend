import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { orderApiQuery, type OrderFilters } from './lib/list-params';

// Orders (spec 03 AD-14, AD-15; design 02 §2.4 `orders.*`, §5.4 admin cancel). R2 adds cancellation (T-M3).

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

/** Seller-order statuses an admin can cancel (backend spec 09 §8.4, UC-OR-10). */
export const ADMIN_CANCELLABLE_STATUSES: readonly AdminSellerOrder['status'][] = [
  'placed',
  'accepted',
  'ready_for_pickup',
];

export const isAdminCancellable = (sellerOrder: Pick<AdminSellerOrder, 'status'>): boolean =>
  ADMIN_CANCELLABLE_STATUSES.includes(sellerOrder.status);

/** What a cancel targets: one seller order, or every open seller order of the order. */
export type CancelTarget =
  | { readonly kind: 'sellerOrder'; readonly sellerOrderId: string }
  | { readonly kind: 'order'; readonly orderId: string };

export interface CancelInput {
  readonly target: CancelTarget;
  /** 3..500, admins only (the customer sees "Cancelled by Nile"). */
  readonly reason: string;
}

/** AD-15 A1 / A2: `200` is the whole admin order after the change (design 02 §5.4). */
export async function cancelAsAdmin(input: CancelInput, idempotencyKey: string): Promise<AdminOrder> {
  const header = { 'Idempotency-Key': idempotencyKey };
  const body = { reason: input.reason };
  const { target } = input;
  const response =
    target.kind === 'sellerOrder'
      ? browserApi.POST('/api/v1/admin/seller-orders/{sellerOrderId}/cancel', {
          params: { path: { sellerOrderId: target.sellerOrderId }, header },
          body,
        })
      : browserApi.POST('/api/v1/admin/orders/{orderId}/cancel', {
          params: { path: { orderId: target.orderId }, header },
          body,
        });
  return (await unwrap(response)).data;
}
