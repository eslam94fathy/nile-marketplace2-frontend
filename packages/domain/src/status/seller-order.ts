import type { SellerOrderStatus } from '../enums';

// Display-only: which actions a seller is offered (spec 02 SE-15, backend spec 09 §1.1, §4.2).
// The backend still decides; a stale status ends in `SELLER_ORDER_INVALID_STATUS_TRANSITION`.

export type SellerOrderAction = 'accept' | 'mark_ready' | 'cancel_order' | 'cancel_items' | 'confirm_return';

const NONE: readonly SellerOrderAction[] = [];

const ACTIONS_BY_STATUS: Readonly<Record<SellerOrderStatus, readonly SellerOrderAction[]>> = {
  pending_payment: NONE,
  placed: ['accept', 'cancel_order', 'cancel_items'],
  accepted: ['mark_ready', 'cancel_order', 'cancel_items'],
  // A courier may already be assigned; cancelling is still allowed until pickup.
  ready_for_pickup: ['cancel_order', 'cancel_items'],
  picked_up: NONE,
  out_for_delivery: NONE,
  delivery_failed: NONE,
  returning_to_seller: ['confirm_return'],
  returned_to_seller: NONE,
  delivered: NONE,
  cancelled: NONE,
};

/** The actions offered for a seller order in this status, in display order. */
export function sellerOrderActions(status: SellerOrderStatus): readonly SellerOrderAction[] {
  return ACTIONS_BY_STATUS[status];
}
