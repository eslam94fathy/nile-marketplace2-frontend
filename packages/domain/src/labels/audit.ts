import type { AuditAction, AuditActorType, AuditTargetType } from '../enums';
import type { Labels } from './types';

/** Spec 03 §7.6. */
export const AUDIT_ACTOR_TYPE_LABELS = {
  admin: 'Admin',
  cli: 'System (command line)',
} as const satisfies Labels<AuditActorType>;

/** Spec 03 AD-38: the target column and filter. */
export const AUDIT_TARGET_TYPE_LABELS = {
  user: 'User',
  seller: 'Seller',
  category: 'Category',
  attribute: 'Attribute',
  option: 'Option',
  product: 'Product',
  governorate: 'Governorate',
  setting: 'Setting',
  delivery_agent: 'Delivery agent',
  shipment: 'Shipment',
  order: 'Order',
  seller_order: 'Seller order',
  payment_refund: 'Refund',
  cod_remittance: 'COD remittance',
  payout: 'Payout',
  support_ticket: 'Support ticket',
  review: 'Review',
  review_reply: 'Review reply',
  return_request: 'Return',
  coupon: 'Coupon',
} as const satisfies Labels<AuditTargetType>;

/** Spec 03 §7.6: one label per audited action, in the order of the backend's spec 20 §2.3. */
export const AUDIT_ACTION_LABELS = {
  'admin.invited': 'Admin invited',
  'admin.seeded': 'First admin created',
  'user.invite_resent': 'Invite resent',
  'user.suspended': 'User suspended',
  'user.reactivated': 'User reactivated',
  'seller.approved': 'Seller approved',
  'seller.rejected': 'Seller rejected',
  'seller.suspended': 'Seller suspended',
  'seller.reinstated': 'Seller reinstated',
  'seller.commission_changed': 'Seller commission changed',
  'setting.default_commission_changed': 'Default commission changed',
  'category.created': 'Category created',
  'category.updated': 'Category updated',
  'category.image_set': 'Category image set',
  'category.image_removed': 'Category image removed',
  'attribute.created': 'Attribute created',
  'attribute.updated': 'Attribute updated',
  'attribute.deleted': 'Attribute deleted',
  'option.created': 'Option created',
  'option.updated': 'Option updated',
  'option.deleted': 'Option deleted',
  'governorate.updated': 'Governorate updated',
  'setting.delivery_changed': 'Delivery settings changed',
  'delivery_agent.created': 'Agent created',
  'delivery_agent.updated': 'Agent updated',
  'delivery_agent.deactivated': 'Agent deactivated',
  'delivery_agent.activated': 'Agent activated',
  'shipment.admin_assigned': 'Shipment assigned',
  'payment_refund.recorded': 'Refund recorded',
  'support_ticket.assigned': 'Ticket assigned',
  'support_ticket.resolved': 'Ticket resolved',
  'support_ticket.closed': 'Ticket closed',
  'review.hidden': 'Review hidden',
  'review.unhidden': 'Review shown again',
  'review_reply.hidden': 'Review reply hidden',
  'review_reply.unhidden': 'Review reply shown again',
  'product.blocked': 'Product blocked',
  'product.unblocked': 'Product unblocked',
  'seller_order.admin_cancelled': 'Seller order cancelled',
  'order.admin_cancelled': 'Order cancelled',
  'return.admin_decided': 'Return decided',
  'return.dispute_resolved': 'Return dispute resolved',
  'payment_refund.retried': 'Refund retried',
  'coupon.created': 'Coupon created',
  'coupon.updated': 'Coupon updated',
  'coupon.blocked': 'Coupon blocked',
  'coupon.unblocked': 'Coupon unblocked',
  'cod_remittance.recorded': 'COD remittance recorded',
  'payout.recorded': 'Payout recorded',
} as const satisfies Labels<AuditAction>;

/**
 * Spec 03 AD-38: the action filter grouped by area, in the backend's spec 20 §2.3 module order. The spec names
 * ten areas; returns (added to spec 20 by R2-P6) get their own (TM10-Q2). Every action is in exactly one area.
 */
export const AUDIT_ACTION_AREAS = [
  {
    area: 'identity',
    label: 'Accounts',
    actions: ['admin.invited', 'admin.seeded', 'user.invite_resent', 'user.suspended', 'user.reactivated'],
  },
  {
    area: 'sellers',
    label: 'Sellers',
    actions: [
      'seller.approved',
      'seller.rejected',
      'seller.suspended',
      'seller.reinstated',
      'seller.commission_changed',
      'setting.default_commission_changed',
    ],
  },
  {
    area: 'catalog',
    label: 'Catalog',
    actions: [
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
      'product.blocked',
      'product.unblocked',
    ],
  },
  {
    area: 'delivery',
    label: 'Delivery',
    actions: [
      'governorate.updated',
      'setting.delivery_changed',
      'delivery_agent.created',
      'delivery_agent.updated',
      'delivery_agent.deactivated',
      'delivery_agent.activated',
      'shipment.admin_assigned',
    ],
  },
  { area: 'ordering', label: 'Orders', actions: ['seller_order.admin_cancelled', 'order.admin_cancelled'] },
  { area: 'returns', label: 'Returns', actions: ['return.admin_decided', 'return.dispute_resolved'] },
  { area: 'payments', label: 'Refunds', actions: ['payment_refund.recorded', 'payment_refund.retried'] },
  { area: 'finance', label: 'Finance', actions: ['cod_remittance.recorded', 'payout.recorded'] },
  {
    area: 'support',
    label: 'Support',
    actions: ['support_ticket.assigned', 'support_ticket.resolved', 'support_ticket.closed'],
  },
  {
    area: 'reviews',
    label: 'Reviews',
    actions: ['review.hidden', 'review.unhidden', 'review_reply.hidden', 'review_reply.unhidden'],
  },
  {
    area: 'promotions',
    label: 'Coupons',
    actions: ['coupon.created', 'coupon.updated', 'coupon.blocked', 'coupon.unblocked'],
  },
] as const satisfies readonly { area: string; label: string; actions: readonly AuditAction[] }[];
