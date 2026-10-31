import type { AuditTargetType } from '@nile/domain';
import {
  agentPath,
  categoryPath,
  couponPath,
  orderPath,
  productPath,
  refundPath,
  returnPath,
  reviewPath,
  sellerPath,
  shipmentPath,
  supportTicketPath,
} from '@/lib/routes';

// AD-38 / AD-39 target links (spec 03 AD-38: "linked to its screen when one exists"). Targets without a console
// screen keyed by their id stay plain text: users (AD-24 has no detail, OQ-22), attributes and options (AD-07 is
// keyed by category), governorates and settings, seller orders (no admin seller-order screen), COD remittances and
// payouts (lists only), review replies (the target id is the reply's, not the review's [VERIFIED backend]).

/** The console screen of a target, or `null` when it has none. */
export function auditTargetHref(targetType: AuditTargetType, targetId: string | null) {
  if (targetId === null) return null;
  switch (targetType) {
    case 'seller':
      return sellerPath(targetId);
    case 'category':
      return categoryPath(targetId);
    case 'product':
      return productPath(targetId);
    case 'delivery_agent':
      return agentPath(targetId);
    case 'shipment':
      return shipmentPath(targetId);
    case 'order':
      return orderPath(targetId);
    case 'payment_refund':
      return refundPath(targetId);
    case 'support_ticket':
      return supportTicketPath(targetId);
    case 'review':
      return reviewPath(targetId);
    case 'return_request':
      return returnPath(targetId);
    case 'coupon':
      return couponPath(targetId);
    default:
      return null;
  }
}
