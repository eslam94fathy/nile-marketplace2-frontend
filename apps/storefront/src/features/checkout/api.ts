import { unwrap, type Schema } from '@nile/api';
import { browserApi } from '@/lib/browser-api';

export type CheckoutBody = Schema<'CheckoutDto'>;
export type CheckoutResult = Schema<'CheckoutResultDto'>;
export type PaymentMethod = CheckoutBody['paymentMethod'];

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
