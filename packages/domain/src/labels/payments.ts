import type { PaymentMethod, PaymentStatus, RefundMethod, RefundReason, RefundStatus } from '../enums';
import type { Labels } from './types';

/** Spec 01 §7.3; admin uses the same wording (decided 2026-10-14, T-B6). */
export const PAYMENT_METHOD_LABELS = {
  cod: 'Cash on delivery',
  kashier: 'Card (Kashier)',
} as const satisfies Labels<PaymentMethod>;

/** Spec 01 §7.3; admin uses the same wording (decided 2026-10-14, T-B6). `cancelled` is COD only. */
export const PAYMENT_STATUS_LABELS = {
  pending: 'To be paid on delivery',
  partially_collected: 'Partly paid on delivery',
  collected: 'Paid on delivery',
  cancelled: 'Not charged',
  initiated: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Payment failed',
  expired: 'Payment window expired',
  partially_refunded: 'Partly refunded',
  refunded: 'Refunded',
} as const satisfies Labels<PaymentStatus>;

/** Spec 03 §4.1. */
export const REFUND_REASON_LABELS = {
  seller_order_cancelled: 'Seller order cancelled',
  items_cancelled: 'Items cancelled',
  delivery_failed: 'Delivery failed (returned)',
  late_payment_after_expiry: 'Paid after the payment window',
  all_cancelled_fee: 'Delivery fee (nothing delivered)',
  amount_mismatch: 'Paid amount didn’t match',
  return: 'Return',
} as const satisfies Labels<RefundReason>;

/** Spec 03 §7.6. */
export const REFUND_STATUS_LABELS = {
  pending_auto: 'Automatic, scheduled',
  processing: 'Automatic, in progress',
  succeeded: 'Refunded automatically',
  pending_manual: 'Needs action',
  recorded: 'Recorded',
} as const satisfies Labels<RefundStatus>;

/** Spec 03 §7.6. */
export const REFUND_METHOD_LABELS = {
  kashier_auto: 'Automatic (Kashier)',
  manual: 'Manual',
} as const satisfies Labels<RefundMethod>;
