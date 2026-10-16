import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TYPES,
  ACTOR_ROLES,
  AGENT_STATUSES,
  ATTEMPT_FAILURE_REASONS,
  CART_LINE_ISSUES,
  ITEM_CANCEL_REASONS,
  LEDGER_ENTRY_TYPES,
  LEDGER_REFERENCE_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRODUCT_STATUSES,
  REFUND_REASONS,
  REFUND_STATUSES,
  SELLER_ORDER_CANCEL_REASONS,
  SELLER_ORDER_STATUSES,
  SELLER_STATUSES,
  SHIPMENT_STATUSES,
  STOCK_MOVEMENT_TYPES,
  USER_ROLES,
  USER_STATUSES,
  VARIANT_STATUSES,
} from '../enums';
import {
  ACCOUNT_TYPE_LABELS,
  ACTOR_ROLE_LABELS,
  AGENT_STATUS_LABELS,
  ATTEMPT_FAILURE_REASON_LABELS,
  cartLineIssueMessage,
  ITEM_CANCEL_REASON_LABELS,
  LEDGER_ENTRY_TYPE_LABELS,
  LEDGER_REFERENCE_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  PRODUCT_STATUS_LABELS,
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
  SELLER_ORDER_CANCEL_REASON_LABELS,
  SELLER_ORDER_STATUS_LABELS,
  SELLER_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  STOCK_MOVEMENT_TYPE_LABELS,
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
  ['AgentStatus', AGENT_STATUSES, AGENT_STATUS_LABELS],
  ['AccountType', ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS],
  ['LedgerEntryType', LEDGER_ENTRY_TYPES, LEDGER_ENTRY_TYPE_LABELS],
  ['LedgerReferenceType', LEDGER_REFERENCE_TYPES, LEDGER_REFERENCE_TYPE_LABELS],
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
    expect(USER_STATUS_LABELS.pending_email_verification).toBe('Email not verified');
    expect(ACTOR_ROLE_LABELS.delivery_agent).toBe('Agent');
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
