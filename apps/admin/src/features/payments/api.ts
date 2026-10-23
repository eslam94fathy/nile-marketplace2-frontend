import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';
import { refundApiQuery, type RefundFilters } from './lib/list-params';

// Payments and refunds (spec 03 AD-15 payment summary, AD-16, AD-17; design 02 §2.4 `orders.payment`,
// `payments.detail`, `refunds.list`, §3.4 "Record refund").

export type AdminPayment = Schema<'AdminPaymentDto'>;
export type Refund = Schema<'RefundDto'>;

const REFUNDS_PAGE_SIZE = 20;

export const paymentKeys = {
  refundLists: () => queryKey('admin', 'refunds', 'list'),
  refunds: (filters: RefundFilters) => queryKey('admin', 'refunds', 'list', filters),
  detail: (paymentId: string) => queryKey('admin', 'payments', 'detail', { paymentId }),
  details: () => queryKey('admin', 'payments', 'detail'),
  orderPayment: (orderId: string) => queryKey('admin', 'orders', 'payment', { orderId }),
  orderPayments: () => queryKey('admin', 'orders', 'payment'),
  dashboard: () => queryKey('admin', 'dashboard', 'refundsToRecord'),
};

/** AD-16: stale 0 (design 02 §2.4). */
export function refundsListOptions(filters: RefundFilters) {
  return infiniteListOptions({
    queryKey: paymentKeys.refunds(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/payments/refunds', {
          params: {
            query: {
              limit: REFUNDS_PAGE_SIZE,
              ...refundApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

/** AD-17: stale 0. */
export function paymentQuery(paymentId: string) {
  return queryOptions({
    queryKey: paymentKeys.detail(paymentId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/payments/{paymentId}', { params: { path: { paymentId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/** AD-15 payment summary: stale 0; `PAYMENT_NOT_FOUND` means the order has no payment record. */
export function orderPaymentQuery(orderId: string) {
  return queryOptions({
    queryKey: paymentKeys.orderPayment(orderId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/orders/{orderId}/payment', { params: { path: { orderId } }, signal }),
        )
      ).data,
    staleTime: 0,
    retry: false,
  });
}

/** No such payment, or not a payment id at all (the backend checks the id format first, as R-36). */
export function isPaymentMissing(error: unknown): boolean {
  return isApiError(error, 'PAYMENT_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

export interface RecordRefundInput {
  readonly refundId: string;
  readonly providerRefundRef: string;
}

/** `Idempotency-Key` per confirmed intent: a retry of the same intent never records twice (AD-16). */
export async function recordRefund(input: RecordRefundInput, idempotencyKey: string): Promise<Refund> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/payments/refunds/{refundId}/record', {
        params: { path: { refundId: input.refundId }, header: { 'Idempotency-Key': idempotencyKey } },
        body: { providerRefundRef: input.providerRefundRef },
      }),
    )
  ).data;
}
