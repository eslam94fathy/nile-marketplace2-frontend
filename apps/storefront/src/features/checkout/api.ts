import { unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

export type CheckoutBody = Schema<'CheckoutDto'>;
export type CheckoutResult = Schema<'CheckoutResultDto'>;
export type PaymentMethod = CheckoutBody['paymentMethod'];
export type CouponQuote = Schema<'CouponQuoteDto'>;

export const couponKeys = {
  preview: (code: string, cartVersion: string) =>
    queryKey('storefront', 'coupon', 'preview', { code, cartVersion }),
};

/**
 * `POST /cart/coupon-preview` (spec 01 SF-07-C): a read that stores nothing, so it runs as a query keyed by the
 * code and the cart it priced (design 02 §2.2). Never retried: a refusal is an answer, and the shopper applies
 * again after a failure.
 */
export function couponPreviewQuery(code: string, cartVersion: string) {
  return queryOptions({
    queryKey: couponKeys.preview(code, cartVersion),
    queryFn: async ({ signal }) =>
      (await unwrap(browserApi.POST('/api/v1/cart/coupon-preview', { body: { code }, signal }))).data,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** `POST /checkout` (spec 01 SF-07-A1) with the key of this intent (design 02 §3.1: idempotent). */
export async function placeOrder(body: CheckoutBody, idempotencyKey: string): Promise<CheckoutResult> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/checkout', {
        body,
        params: { header: { 'Idempotency-Key': idempotencyKey } },
      }),
    )
  ).data;
}
