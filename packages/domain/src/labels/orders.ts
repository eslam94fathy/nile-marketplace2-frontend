import type { ItemCancelReason, OrderStatus, SellerOrderCancelReason, SellerOrderStatus } from '../enums';
import type { Labels } from './types';

/** Customer view: spec 01 §7.1. Admin view: neutral wording decided 2026-10-14 (T-B6). */
export const ORDER_STATUS_LABELS = {
  customer: {
    pending_payment: 'Awaiting payment',
    placed: 'Placed',
    in_progress: 'In progress',
    completed: 'Delivered',
    partially_completed: 'Partially delivered',
    cancelled: 'Cancelled',
  },
  admin: {
    pending_payment: 'Awaiting payment',
    placed: 'Placed',
    in_progress: 'In progress',
    completed: 'Completed',
    partially_completed: 'Partially completed',
    cancelled: 'Cancelled',
  },
} as const satisfies Readonly<Record<'customer' | 'admin', Labels<OrderStatus>>>;

/**
 * Customer view: spec 01 §7.2. Seller view: spec 02 §5.1. Admin view: spec 03 §4.3 plus the neutral
 * wording decided 2026-10-14 (T-B6).
 */
export const SELLER_ORDER_STATUS_LABELS = {
  customer: {
    pending_payment: 'Awaiting payment',
    placed: 'Waiting for seller confirmation',
    accepted: 'Confirmed by seller',
    ready_for_pickup: 'Being prepared for delivery',
    picked_up: 'Picked up by courier',
    out_for_delivery: 'Out for delivery',
    delivery_failed: 'Delivery attempt failed — we’ll try again',
    returning_to_seller: 'Returning to seller',
    returned_to_seller: 'Returned to seller',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  },
  seller: {
    // Never shown: the backend hides unpaid orders from sellers (spec 02 §5.1). Neutral text as a fallback.
    pending_payment: 'Awaiting payment',
    placed: 'New — confirm',
    accepted: 'Confirmed — prepare',
    ready_for_pickup: 'Ready for pickup',
    picked_up: 'Picked up',
    out_for_delivery: 'Out for delivery',
    delivery_failed: 'Delivery attempt failed',
    returning_to_seller: 'Being returned to you',
    returned_to_seller: 'Returned',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  },
  admin: {
    pending_payment: 'Awaiting payment',
    placed: 'Placed (awaiting seller)',
    accepted: 'Accepted',
    ready_for_pickup: 'Ready for pickup',
    picked_up: 'Picked up',
    out_for_delivery: 'Out for delivery',
    delivery_failed: 'Delivery attempt failed',
    returning_to_seller: 'Returning to seller',
    returned_to_seller: 'Returned to seller',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  },
} as const satisfies Readonly<Record<'customer' | 'seller' | 'admin', Labels<SellerOrderStatus>>>;

/** Seller view: spec 02 §5.2. The admin wording is not specified yet (CLAUDE.md §14.3). */
export const SELLER_ORDER_CANCEL_REASON_LABELS = {
  seller: {
    customer_cancelled: 'Cancelled by the customer',
    seller_cancelled: 'Cancelled by you',
    seller_acceptance_timeout: 'Not confirmed within 24 hours',
    payment_failed: 'The customer’s card payment failed',
    payment_expired: 'The customer didn’t complete the card payment',
  },
} as const satisfies Readonly<Record<'seller', Labels<SellerOrderCancelReason>>>;

/** Spec 02 SE-15 A4. */
export const ITEM_CANCEL_REASON_LABELS = {
  out_of_stock: 'Out of stock',
  seller_request: 'Seller request',
  other: 'Other',
} as const satisfies Labels<ItemCancelReason>;
