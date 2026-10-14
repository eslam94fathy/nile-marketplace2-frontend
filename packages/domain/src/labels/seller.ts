import type { SellerStatus } from '../enums';
import type { Labels } from './types';

/** Spec 02 §5.4. */
export const SELLER_STATUS_LABELS = {
  pending_approval: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
} as const satisfies Labels<SellerStatus>;
