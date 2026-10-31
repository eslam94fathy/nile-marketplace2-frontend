import { isApiError } from '@nile/api';
import { defaultErrorMessage, formatMoney, rateLimitedMessage } from '@nile/domain';
import type { Cart } from '@/features/cart';
import { CHECKOUT_COPY } from '../copy';

// Coupon at checkout (spec 01 SF-07-C). The code is trimmed and upper-cased like the backend's quote
// [SPEC 19 PR-12]; the shape check stops typos before a request.

const COUPON_CODE = /^[A-Z0-9-]{4,32}$/;

/** The code to send, or null when it can't be a coupon code. */
export function normaliseCouponCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return COUPON_CODE.test(code) ? code : null;
}

/**
 * The cart as the preview saw it: the preview reflects the cart at preview time [SPEC 19 PR-1], so any change
 * of lines, quantities or prices asks for a new one (design 02 `coupon.preview(code, cartVersion)`).
 */
export function cartVersion(cart: Cart): string {
  const lines = cart.sellers.flatMap((seller) =>
    seller.items.map((item) => `${item.id}:${String(item.quantity)}:${item.lineTotal}:${item.issue ?? ''}`),
  );
  return `${cart.itemsTotal}|${lines.join(',')}`;
}

const COUPON_ERRORS = [
  'COUPON_NOT_FOUND',
  'COUPON_INACTIVE',
  'COUPON_NOT_ACTIVE_YET',
  'COUPON_EXPIRED',
  'COUPON_LIMIT_REACHED',
  'COUPON_CUSTOMER_LIMIT_REACHED',
  'COUPON_NOT_APPLICABLE',
] as const;

/** True for the codes that mean "this coupon can't be used on this cart" (preview or checkout). */
export function isCouponError(error: unknown): boolean {
  return isApiError(error, ...COUPON_ERRORS, 'COUPON_MIN_SUBTOTAL_NOT_MET');
}

/** The sentence under the coupon field for a failed preview or a coupon refused at checkout. */
export function couponErrorMessage(error: unknown): string {
  for (const code of COUPON_ERRORS) {
    if (isApiError(error, code)) return CHECKOUT_COPY.coupon.errors[code];
  }
  if (isApiError(error, 'COUPON_MIN_SUBTOTAL_NOT_MET')) {
    // The missing amount travels in the details [VERIFIED backend `couponMinSubtotalNotMet`].
    const missing = error.details.find((detail) => detail.constraint === 'min_items_subtotal')?.value;
    return typeof missing === 'string'
      ? CHECKOUT_COPY.coupon.errors.minSubtotal(formatMoney(missing))
      : CHECKOUT_COPY.coupon.errors.minSubtotalUnknown;
  }
  if (isApiError(error, 'RATE_LIMITED') && error.retryAfterSeconds !== null) {
    return rateLimitedMessage(error.retryAfterSeconds);
  }
  return defaultErrorMessage(isApiError(error) ? error.code : 'NETWORK_ERROR');
}
