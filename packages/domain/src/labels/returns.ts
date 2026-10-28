import type {
  RefundPayoutMethod,
  ReturnFeePayer,
  ReturnReason,
  ReturnRefundStatus,
  ReturnRefusalReason,
  ReturnStatus,
} from '../enums';
import type { Labels } from './types';

/** Customer view: spec 01 §10.6. Seller view: spec 02 §8.6. Admin view: spec 03 §7.6. */
export const RETURN_STATUS_LABELS = {
  customer: {
    requested: 'Waiting for the seller',
    rejected: 'Rejected by the seller',
    escalated: 'Under review by Nile',
    approved: 'Approved',
    picked_up: 'On its way to the seller',
    received: 'Being checked by the seller',
    disputed: 'Under review by Nile',
    completed: 'Completed',
    refused: 'Closed without refund',
    cancelled: 'Cancelled',
    pickup_failed: 'Pickup failed',
  },
  seller: {
    requested: 'To decide',
    rejected: 'Rejected by you',
    escalated: 'Under review by Nile',
    approved: 'Approved, awaiting pickup',
    picked_up: 'On its way to you',
    received: 'To check',
    disputed: 'Under review by Nile',
    completed: 'Completed',
    refused: 'Closed, not refunded',
    cancelled: 'Cancelled by the customer',
    pickup_failed: 'Pickup failed',
  },
  admin: {
    requested: 'Waiting for seller',
    rejected: 'Rejected by seller',
    escalated: 'Escalated',
    approved: 'Approved',
    picked_up: 'Picked up',
    received: 'Received by seller',
    disputed: 'Disputed by seller',
    completed: 'Completed',
    refused: 'Refused',
    cancelled: 'Cancelled by customer',
    pickup_failed: 'Pickup failed',
  },
} as const satisfies Readonly<Record<'customer' | 'seller' | 'admin', Labels<ReturnStatus>>>;

/** Customer view: spec 01 §10.6. Seller and admin view: spec 02 §8.6. */
export const RETURN_REASON_LABELS = {
  customer: {
    damaged: 'Damaged',
    wrong_item: 'Wrong item',
    not_as_described: 'Not as described',
    changed_mind: 'Changed my mind',
  },
  staff: {
    damaged: 'Damaged',
    wrong_item: 'Wrong item',
    not_as_described: 'Not as described',
    changed_mind: 'Changed their mind',
  },
} as const satisfies Readonly<Record<'customer' | 'staff', Labels<ReturnReason>>>;

/** Customer view: spec 01 §10.6 (a sentence). Admin view: spec 03 §7.6. */
export const RETURN_REFUSAL_REASON_LABELS = {
  customer: {
    seller_rejected: 'The seller rejected the return and it wasn’t escalated in time.',
    admin_rejected: 'Nile reviewed the return and couldn’t accept it.',
    dispute_upheld: 'Nile reviewed the seller’s report and the return wasn’t refunded.',
  },
  admin: {
    seller_rejected: 'Seller rejected (not escalated)',
    admin_rejected: 'Rejected by Nile',
    dispute_upheld: 'Dispute upheld',
  },
} as const satisfies Readonly<Record<'customer' | 'admin', Labels<ReturnRefusalReason>>>;

/** Spec 03 §7.6. */
export const RETURN_FEE_PAYER_LABELS = {
  seller: 'Seller',
  customer: 'Customer',
} as const satisfies Labels<ReturnFeePayer>;

/** Spec 01 §10.6. */
export const REFUND_PAYOUT_METHOD_LABELS = {
  mobile_wallet: 'Mobile wallet',
  instapay: 'InstaPay',
} as const satisfies Labels<RefundPayoutMethod>;

/** Spec 01 §10.6: the refund as the return shows it. */
export const RETURN_REFUND_STATUS_LABELS = {
  pending: 'Refund scheduled',
  processing: 'Refund in progress',
  succeeded: 'Refunded',
  manual: 'Being processed by our team',
} as const satisfies Labels<ReturnRefundStatus>;
