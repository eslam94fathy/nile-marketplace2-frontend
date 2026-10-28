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

/** `return_restock`: a customer return the seller put back in stock (R2, backend spec 07 §8). */
export const STOCK_MOVEMENT_TYPES = [
  'seller_adjustment',
  'reserve',
  'release',
  'commit',
  'return_restock',
] as const;
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
  'admin_cancelled',
] as const;
export type SellerOrderCancelReason = (typeof SELLER_ORDER_CANCEL_REASONS)[number];

export const ITEM_CANCEL_REASONS = ['out_of_stock', 'seller_request', 'other'] as const;
export type ItemCancelReason = (typeof ITEM_CANCEL_REASONS)[number];

export const PAYMENT_METHODS = ['cod', 'kashier'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** COD statuses then Kashier statuses; `cancelled` is COD only. The refund values replaced `_manually` in R2 (spec 10 PA-23). */
export const PAYMENT_STATUSES = [
  'pending',
  'partially_collected',
  'collected',
  'cancelled',
  'initiated',
  'paid',
  'failed',
  'expired',
  'partially_refunded',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_REASONS = [
  'seller_order_cancelled',
  'items_cancelled',
  'delivery_failed',
  'late_payment_after_expiry',
  'all_cancelled_fee',
  'amount_mismatch',
  'return',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

/** `pending_auto` → `processing` → `succeeded` is the automatic Kashier path; `pending_manual` → `recorded` the manual one. */
export const REFUND_STATUSES = [
  'pending_auto',
  'processing',
  'succeeded',
  'pending_manual',
  'recorded',
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_METHODS = ['kashier_auto', 'manual'] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

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
  'pickup_failed',
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** `return`: a customer return collected from the customer and handed to the seller (spec 11 §8). */
export const SHIPMENT_KINDS = ['delivery', 'return'] as const;
export type ShipmentKind = (typeof SHIPMENT_KINDS)[number];

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
  'seller_pending',
  'customer_refund_payable',
  'platform_promotions',
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
  'seller_net_held',
  'seller_net_released',
  'seller_net_reversed',
  'commission_reversed',
  'return_fee_charged',
  'return_fee_earned',
  'customer_refund_owed',
  'customer_refund_paid',
  'promotion_funded',
  'promotion_reversed',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export const LEDGER_REFERENCE_TYPES = [
  'seller_order',
  'order',
  'cod_remittance',
  'payout',
  'return',
  'refund',
  'seller_order_hold',
] as const;
export type LedgerReferenceType = (typeof LEDGER_REFERENCE_TYPES)[number];

// Release 2 (backend ecbcd19, api-inventory §11.5).

export const MEDIA_PURPOSES = [
  'product_image',
  'category_image',
  'support_attachment',
  'review_image',
  'return_photo',
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const MEDIA_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

export const MEDIA_FAILURE_REASONS = [
  'decode_failed',
  'unsupported_type',
  'dimensions_out_of_range',
] as const;
export type MediaFailureReason = (typeof MEDIA_FAILURE_REASONS)[number];

export const NOTIFICATION_CATEGORIES = ['orders', 'shipments', 'support', 'promotions'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** One per row of backend spec 13 §8.2, §8.8, §8.9 and NO-35. Never rendered: titles and bodies come from the API. */
export const NOTIFICATION_TYPES = [
  'order_placed',
  'seller_order_received',
  'seller_order_accepted',
  'seller_order_cancelled',
  'payment_failed',
  'shipment_assigned',
  'out_for_delivery',
  'delivery_attempt_failed',
  'delivered',
  'support_reply',
  'support_user_message',
  'support_resolved',
  'review_received',
  'review_replied',
  'product_blocked',
  'return_requested',
  'return_approved',
  'return_rejected',
  'return_picked_up',
  'return_received',
  'return_completed',
  'return_refused',
  'refund_issued',
  'coupon_blocked',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** `seller_onboarding` is for sellers only (spec 16 §1). */
export const TICKET_CATEGORIES = [
  'order',
  'payment',
  'delivery',
  'return',
  'account',
  'seller_onboarding',
  'other',
] as const;
export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export const TICKET_STATUSES = ['open', 'awaiting_admin', 'awaiting_user', 'resolved', 'closed'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_OPENER_ROLES = ['customer', 'seller'] as const;
export type TicketOpenerRole = (typeof TICKET_OPENER_ROLES)[number];

/** Users never receive `internal_note` messages (spec 16 §4). */
export const MESSAGE_KINDS = ['message', 'internal_note', 'system'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const REVIEW_STATUSES = ['published', 'hidden'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Open statuses first, then the terminal ones (spec 18 §1). */
export const RETURN_STATUSES = [
  'requested',
  'rejected',
  'escalated',
  'approved',
  'picked_up',
  'received',
  'disputed',
  'completed',
  'refused',
  'cancelled',
  'pickup_failed',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const OPEN_RETURN_STATUSES = [
  'requested',
  'rejected',
  'escalated',
  'approved',
  'picked_up',
  'received',
  'disputed',
] as const satisfies readonly ReturnStatus[];

/** The first three are seller-fault reasons: the seller pays the return fee, photos are required (spec 18 §1.2). */
export const RETURN_REASONS = ['damaged', 'wrong_item', 'not_as_described', 'changed_mind'] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_FEE_PAYERS = ['seller', 'customer'] as const;
export type ReturnFeePayer = (typeof RETURN_FEE_PAYERS)[number];

export const RETURN_REFUSAL_REASONS = ['seller_rejected', 'admin_rejected', 'dispute_upheld'] as const;
export type ReturnRefusalReason = (typeof RETURN_REFUSAL_REASONS)[number];

/** COD return refunds only (spec 18 RE-8). */
export const REFUND_PAYOUT_METHODS = ['mobile_wallet', 'instapay'] as const;
export type RefundPayoutMethod = (typeof REFUND_PAYOUT_METHODS)[number];

/** The refund as a return shows it (`ReturnDto.refund.status`, payments `getRefundsByReturnIds`). */
export const RETURN_REFUND_STATUSES = ['pending', 'processing', 'succeeded', 'manual'] as const;
export type ReturnRefundStatus = (typeof RETURN_REFUND_STATUSES)[number];

export const COUPON_FUNDINGS = ['platform', 'seller'] as const;
export type CouponFunding = (typeof COUPON_FUNDINGS)[number];

export const DISCOUNT_TYPES = ['percent', 'fixed'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const COUPON_SCOPES = ['all', 'seller', 'category'] as const;
export type CouponScope = (typeof COUPON_SCOPES)[number];

export const COUPON_STATUSES = ['active', 'inactive'] as const;
export type CouponStatus = (typeof COUPON_STATUSES)[number];

/** Derived from the dates for display only (spec 19 §1). */
export const COUPON_DISPLAY_STATUSES = ['scheduled', 'active', 'expired', 'inactive'] as const;
export type CouponDisplayStatus = (typeof COUPON_DISPLAY_STATUSES)[number];

export const REDEMPTION_STATUSES = ['active', 'released'] as const;
export type RedemptionStatus = (typeof REDEMPTION_STATUSES)[number];

export const AUDIT_ACTOR_TYPES = ['admin', 'cli'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_TARGET_TYPES = [
  'user',
  'seller',
  'category',
  'attribute',
  'option',
  'product',
  'governorate',
  'setting',
  'delivery_agent',
  'shipment',
  'order',
  'seller_order',
  'payment_refund',
  'cod_remittance',
  'payout',
  'support_ticket',
  'review',
  'review_reply',
  'return_request',
  'coupon',
] as const;
export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

/** Every audited admin write (spec 20 §2.3), grouped by area. */
export const AUDIT_ACTIONS = [
  'admin.invited',
  'admin.seeded',
  'user.invite_resent',
  'user.suspended',
  'user.reactivated',
  'seller.approved',
  'seller.rejected',
  'seller.suspended',
  'seller.reinstated',
  'seller.commission_changed',
  'setting.default_commission_changed',
  'category.created',
  'category.updated',
  'category.image_set',
  'category.image_removed',
  'attribute.created',
  'attribute.updated',
  'attribute.deleted',
  'option.created',
  'option.updated',
  'option.deleted',
  'governorate.updated',
  'setting.delivery_changed',
  'delivery_agent.created',
  'delivery_agent.updated',
  'delivery_agent.deactivated',
  'delivery_agent.activated',
  'shipment.admin_assigned',
  'payment_refund.recorded',
  'support_ticket.assigned',
  'support_ticket.resolved',
  'support_ticket.closed',
  'review.hidden',
  'review.unhidden',
  'review_reply.hidden',
  'review_reply.unhidden',
  'product.blocked',
  'product.unblocked',
  'seller_order.admin_cancelled',
  'order.admin_cancelled',
  'return.admin_decided',
  'return.dispute_resolved',
  'payment_refund.retried',
  'coupon.created',
  'coupon.updated',
  'coupon.blocked',
  'coupon.unblocked',
  'cod_remittance.recorded',
  'payout.recorded',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
