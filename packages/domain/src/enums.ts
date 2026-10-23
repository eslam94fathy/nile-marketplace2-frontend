// Enumerations the UI renders (api-inventory §8), as value lists so labels and status helpers can be
// exhaustive. enums.type-test.ts keeps each list equal to the generated API types: a new backend value
// fails type-check here first, then in every label map that misses it.

export const USER_ROLES = ['customer', 'seller', 'admin', 'delivery_agent'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['pending_email_verification', 'invited', 'active', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/** History `actorRole`: the user roles plus `system` (background jobs). */
export const ACTOR_ROLES = [...USER_ROLES, 'system'] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export const SELLER_STATUSES = ['pending_approval', 'approved', 'rejected', 'suspended'] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const PRODUCT_STATUSES = ['draft', 'active', 'inactive'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const VARIANT_STATUSES = ['active', 'inactive'] as const;
export type VariantStatus = (typeof VARIANT_STATUSES)[number];

export const STOCK_MOVEMENT_TYPES = ['seller_adjustment', 'reserve', 'release', 'commit'] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const CART_LINE_ISSUES = ['UNAVAILABLE', 'OUT_OF_STOCK', 'INSUFFICIENT_STOCK'] as const;
export type CartLineIssue = (typeof CART_LINE_ISSUES)[number];

export const ORDER_STATUSES = [
  'pending_payment',
  'placed',
  'in_progress',
  'completed',
  'partially_completed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SELLER_ORDER_STATUSES = [
  'pending_payment',
  'placed',
  'accepted',
  'ready_for_pickup',
  'picked_up',
  'out_for_delivery',
  'delivery_failed',
  'returning_to_seller',
  'returned_to_seller',
  'delivered',
  'cancelled',
] as const;
export type SellerOrderStatus = (typeof SELLER_ORDER_STATUSES)[number];

export const SELLER_ORDER_CANCEL_REASONS = [
  'customer_cancelled',
  'seller_cancelled',
  'seller_acceptance_timeout',
  'payment_failed',
  'payment_expired',
] as const;
export type SellerOrderCancelReason = (typeof SELLER_ORDER_CANCEL_REASONS)[number];

export const ITEM_CANCEL_REASONS = ['out_of_stock', 'seller_request', 'other'] as const;
export type ItemCancelReason = (typeof ITEM_CANCEL_REASONS)[number];

export const PAYMENT_METHODS = ['cod', 'kashier'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** COD statuses then Kashier statuses; `cancelled` is COD only. */
export const PAYMENT_STATUSES = [
  'pending',
  'partially_collected',
  'collected',
  'cancelled',
  'initiated',
  'paid',
  'failed',
  'expired',
  'partially_refunded_manually',
  'refunded_manually',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_REASONS = [
  'seller_order_cancelled',
  'items_cancelled',
  'delivery_failed',
  'late_payment_after_expiry',
  'all_cancelled_fee',
  'amount_mismatch',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const REFUND_STATUSES = ['pending_manual', 'recorded'] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const SHIPMENT_STATUSES = [
  'unassigned',
  'assigned',
  'picked_up',
  'out_for_delivery',
  'delivery_failed',
  'returning_to_seller',
  'returned_to_seller',
  'delivered',
  'cancelled',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const AGENT_STATUSES = ['active', 'inactive'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

export const ATTEMPT_FAILURE_REASONS = [
  'customer_unreachable',
  'customer_refused',
  'wrong_address',
  'customer_rescheduled',
] as const;
export type AttemptFailureReason = (typeof ATTEMPT_FAILURE_REASONS)[number];

export const ACCOUNT_TYPES = [
  'seller_payable',
  'agent_fee_payable',
  'agent_cod_cash',
  'platform_commission_revenue',
  'platform_delivery_revenue',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const LEDGER_ENTRY_TYPES = [
  'seller_net_earned',
  'commission_earned',
  'agent_fee_earned',
  'platform_fee_earned',
  'cod_cash_collected',
  'cod_cash_remitted',
  'seller_payout',
  'agent_payout',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_REFERENCE_TYPES = ['seller_order', 'order', 'cod_remittance', 'payout'] as const;
export type LedgerReferenceType = (typeof LEDGER_REFERENCE_TYPES)[number];
