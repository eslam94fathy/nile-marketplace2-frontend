import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TYPES,
  ACTOR_ROLES,
  AGENT_STATUSES,
  ATTEMPT_FAILURE_REASONS,
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_TARGET_TYPES,
  CART_LINE_ISSUES,
  COUPON_DISPLAY_STATUSES,
  COUPON_FUNDINGS,
  COUPON_SCOPES,
  REDEMPTION_STATUSES,
  DISCOUNT_TYPES,
  ITEM_CANCEL_REASONS,
  LEDGER_ENTRY_TYPES,
  LEDGER_REFERENCE_TYPES,
  NOTIFICATION_CATEGORIES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRODUCT_STATUSES,
  REFUND_METHODS,
  REFUND_PAYOUT_METHODS,
  REFUND_REASONS,
  REFUND_STATUSES,
  RETURN_FEE_PAYERS,
  RETURN_REASONS,
  RETURN_REFUND_STATUSES,
  RETURN_REFUSAL_REASONS,
  RETURN_STATUSES,
  REVIEW_STATUSES,
  SELLER_ORDER_CANCEL_REASONS,
  SELLER_ORDER_STATUSES,
  SELLER_STATUSES,
  SHIPMENT_KINDS,
  SHIPMENT_STATUSES,
  STOCK_MOVEMENT_TYPES,
  TICKET_CATEGORIES,
  TICKET_STATUSES,
  USER_ROLES,
  USER_STATUSES,
  VARIANT_STATUSES,
} from '../enums';
import {
  ACCOUNT_TYPE_LABELS,
  ACTOR_ROLE_LABELS,
  AGENT_STATUS_LABELS,
  ATTEMPT_FAILURE_REASON_LABELS,
  AUDIT_ACTION_AREAS,
  AUDIT_ACTION_LABELS,
  AUDIT_ACTOR_TYPE_LABELS,
  AUDIT_TARGET_TYPE_LABELS,
  cartLineIssueMessage,
  COUPON_DISPLAY_STATUS_LABELS,
  COUPON_FUNDING_LABELS,
  COUPON_SCOPE_LABELS,
  DISCOUNT_TYPE_LABELS,
  ITEM_CANCEL_REASON_LABELS,
  REDEMPTION_STATUS_LABELS,
  LEDGER_ENTRY_TYPE_LABELS,
  LEDGER_REFERENCE_TYPE_LABELS,
  NOTIFICATION_CATEGORY_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  REFUND_METHOD_LABELS,
  REFUND_PAYOUT_METHOD_LABELS,
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
  RETURN_FEE_PAYER_LABELS,
  RETURN_REASON_LABELS,
  RETURN_REFUND_STATUS_LABELS,
  RETURN_REFUSAL_REASON_LABELS,
  RETURN_STATUS_LABELS,
  REVIEW_STATUS_LABELS,
  SELLER_ORDER_CANCEL_REASON_LABELS,
  SELLER_ORDER_STATUS_LABELS,
  SELLER_STATUS_LABELS,
  SHIPMENT_KIND_LABELS,
  SHIPMENT_STATUS_LABELS,
  STOCK_MOVEMENT_TYPE_LABELS,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  USER_ROLE_LABELS,
  USER_STATUS_LABELS,
  VARIANT_STATUS_LABELS,
} from './index';

// Type-checking already proves exhaustiveness (labels.type-test.ts); this guards the runtime objects:
// exactly the enum's keys, each with non-empty copy.
const cases: [string, readonly string[], Readonly<Record<string, string>>][] = [
  ['UserRole', USER_ROLES, USER_ROLE_LABELS],
  ['ActorRole', ACTOR_ROLES, ACTOR_ROLE_LABELS],
  ['UserStatus', USER_STATUSES, USER_STATUS_LABELS],
  ['SellerStatus', SELLER_STATUSES, SELLER_STATUS_LABELS],
  ['ProductStatus', PRODUCT_STATUSES, PRODUCT_STATUS_LABELS],
  ['VariantStatus', VARIANT_STATUSES, VARIANT_STATUS_LABELS],
  ['StockMovementType', STOCK_MOVEMENT_TYPES, STOCK_MOVEMENT_TYPE_LABELS],
  ['OrderStatus customer', ORDER_STATUSES, ORDER_STATUS_LABELS.customer],
  ['OrderStatus admin', ORDER_STATUSES, ORDER_STATUS_LABELS.admin],
  ['SellerOrderStatus customer', SELLER_ORDER_STATUSES, SELLER_ORDER_STATUS_LABELS.customer],
  ['SellerOrderStatus seller', SELLER_ORDER_STATUSES, SELLER_ORDER_STATUS_LABELS.seller],
  ['SellerOrderStatus admin', SELLER_ORDER_STATUSES, SELLER_ORDER_STATUS_LABELS.admin],
  [
    'SellerOrderCancelReason customer',
    SELLER_ORDER_CANCEL_REASONS,
    SELLER_ORDER_CANCEL_REASON_LABELS.customer,
  ],
  ['SellerOrderCancelReason seller', SELLER_ORDER_CANCEL_REASONS, SELLER_ORDER_CANCEL_REASON_LABELS.seller],
  ['SellerOrderCancelReason admin', SELLER_ORDER_CANCEL_REASONS, SELLER_ORDER_CANCEL_REASON_LABELS.admin],
  ['ItemCancelReason', ITEM_CANCEL_REASONS, ITEM_CANCEL_REASON_LABELS],
  ['PaymentMethod', PAYMENT_METHODS, PAYMENT_METHOD_LABELS],
  ['PaymentStatus', PAYMENT_STATUSES, PAYMENT_STATUS_LABELS],
  ['RefundReason', REFUND_REASONS, REFUND_REASON_LABELS],
  ['RefundStatus', REFUND_STATUSES, REFUND_STATUS_LABELS],
  ['ShipmentStatus admin', SHIPMENT_STATUSES, SHIPMENT_STATUS_LABELS.admin],
  ['ShipmentStatus agent', SHIPMENT_STATUSES, SHIPMENT_STATUS_LABELS.agent],
  ['AttemptFailureReason admin', ATTEMPT_FAILURE_REASONS, ATTEMPT_FAILURE_REASON_LABELS.admin],
  ['AttemptFailureReason agent', ATTEMPT_FAILURE_REASONS, ATTEMPT_FAILURE_REASON_LABELS.agent],
  ['AttemptFailureReason pickup', ATTEMPT_FAILURE_REASONS, ATTEMPT_FAILURE_REASON_LABELS.pickup],
  ['ShipmentStatus agent return', SHIPMENT_STATUSES, SHIPMENT_STATUS_LABELS.agentReturn],
  ['AgentStatus', AGENT_STATUSES, AGENT_STATUS_LABELS],
  ['AccountType', ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS],
  ['LedgerEntryType', LEDGER_ENTRY_TYPES, LEDGER_ENTRY_TYPE_LABELS],
  ['LedgerReferenceType', LEDGER_REFERENCE_TYPES, LEDGER_REFERENCE_TYPE_LABELS],
  ['RefundMethod', REFUND_METHODS, REFUND_METHOD_LABELS],
  ['ShipmentKind admin', SHIPMENT_KINDS, SHIPMENT_KIND_LABELS.admin],
  ['ShipmentKind agent', SHIPMENT_KINDS, SHIPMENT_KIND_LABELS.agent],
  ['NotificationCategory', NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS],
  ['TicketStatus user', TICKET_STATUSES, TICKET_STATUS_LABELS.user],
  ['TicketStatus admin', TICKET_STATUSES, TICKET_STATUS_LABELS.admin],
  ['TicketCategory', TICKET_CATEGORIES, TICKET_CATEGORY_LABELS],
  ['ReviewStatus author', REVIEW_STATUSES, REVIEW_STATUS_LABELS.author],
  ['ReviewStatus admin', REVIEW_STATUSES, REVIEW_STATUS_LABELS.admin],
  ['ReturnStatus customer', RETURN_STATUSES, RETURN_STATUS_LABELS.customer],
  ['ReturnStatus seller', RETURN_STATUSES, RETURN_STATUS_LABELS.seller],
  ['ReturnStatus admin', RETURN_STATUSES, RETURN_STATUS_LABELS.admin],
  ['ReturnReason customer', RETURN_REASONS, RETURN_REASON_LABELS.customer],
  ['ReturnReason staff', RETURN_REASONS, RETURN_REASON_LABELS.staff],
  ['ReturnRefusalReason customer', RETURN_REFUSAL_REASONS, RETURN_REFUSAL_REASON_LABELS.customer],
  ['ReturnRefusalReason admin', RETURN_REFUSAL_REASONS, RETURN_REFUSAL_REASON_LABELS.admin],
  ['ReturnFeePayer', RETURN_FEE_PAYERS, RETURN_FEE_PAYER_LABELS],
  ['RefundPayoutMethod', REFUND_PAYOUT_METHODS, REFUND_PAYOUT_METHOD_LABELS],
  ['ReturnRefundStatus', RETURN_REFUND_STATUSES, RETURN_REFUND_STATUS_LABELS],
  ['CouponDisplayStatus', COUPON_DISPLAY_STATUSES, COUPON_DISPLAY_STATUS_LABELS],
  ['CouponFunding', COUPON_FUNDINGS, COUPON_FUNDING_LABELS],
  ['DiscountType', DISCOUNT_TYPES, DISCOUNT_TYPE_LABELS],
  ['CouponScope seller', COUPON_SCOPES, COUPON_SCOPE_LABELS.seller],
  ['CouponScope admin', COUPON_SCOPES, COUPON_SCOPE_LABELS.admin],
  ['RedemptionStatus', REDEMPTION_STATUSES, REDEMPTION_STATUS_LABELS],
  ['AuditActorType', AUDIT_ACTOR_TYPES, AUDIT_ACTOR_TYPE_LABELS],
  ['AuditTargetType', AUDIT_TARGET_TYPES, AUDIT_TARGET_TYPE_LABELS],
  ['AuditAction', AUDIT_ACTIONS, AUDIT_ACTION_LABELS],
];

describe('label maps', () => {
  it.each(cases)('%s has exactly one non-empty label per value', (_name, values, labels) => {
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const value of values) expect(labels[value]?.trim()).toBeTruthy();
  });

  it('uses the approved wording for a sample of values', () => {
    expect(ORDER_STATUS_LABELS.customer.completed).toBe('Delivered');
    expect(ORDER_STATUS_LABELS.admin.completed).toBe('Completed');
    expect(SELLER_ORDER_STATUS_LABELS.admin.placed).toBe('Placed (awaiting seller)');
    expect(SELLER_ORDER_STATUS_LABELS.seller.placed).toBe('New — confirm');
    expect(SHIPMENT_STATUS_LABELS.agent.out_for_delivery).toBe('On the way');
    expect(SHIPMENT_STATUS_LABELS.agentReturn.picked_up).toBe('Collected — take to the seller');
    expect(SHIPMENT_STATUS_LABELS.agentReturn.delivered).toBe('Handed to the seller');
    expect(USER_STATUS_LABELS.pending_email_verification).toBe('Email not verified');
    expect(ACTOR_ROLE_LABELS.delivery_agent).toBe('Agent');
    expect(PAYMENT_STATUS_LABELS.partially_refunded).toBe('Partly refunded');
    expect(REFUND_STATUS_LABELS.pending_manual).toBe('Needs action');
    expect(SELLER_ORDER_CANCEL_REASON_LABELS.customer.admin_cancelled).toBe('Cancelled by Nile');
    expect(SHIPMENT_KIND_LABELS.agent.return).toBe('Return pickup');
    expect(TICKET_STATUS_LABELS.user.awaiting_user).toBe('Support replied');
    expect(RETURN_STATUS_LABELS.seller.received).toBe('To check');
  });
});

describe('cartLineIssueMessage', () => {
  it('gives one notice per issue, with the available quantity where needed', () => {
    expect(CART_LINE_ISSUES.map((issue) => cartLineIssueMessage(issue, 3))).toEqual([
      'This item is no longer available.',
      'Out of stock.',
      'Only 3 available.',
    ]);
  });
});

describe('AUDIT_ACTION_AREAS', () => {
  it('puts every audit action in exactly one area', () => {
    const grouped = AUDIT_ACTION_AREAS.flatMap((group) => [...group.actions]);
    expect([...grouped].sort()).toEqual([...AUDIT_ACTIONS].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });
});
