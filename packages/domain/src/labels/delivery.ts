import type { AgentStatus, AttemptFailureReason, ShipmentStatus } from '../enums';
import type { Labels } from './types';

/** Admin view: spec 03 §4.3. Agent view: spec 04 §4.1. */
export const SHIPMENT_STATUS_LABELS = {
  admin: {
    unassigned: 'Unassigned',
    assigned: 'Assigned',
    picked_up: 'Picked up',
    out_for_delivery: 'Out for delivery',
    delivery_failed: 'Attempt failed',
    returning_to_seller: 'Returning to seller',
    returned_to_seller: 'Returned to seller',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  },
  agent: {
    // Never shown: agents only see shipments assigned to them (spec 04 §4.1). Admin text as a fallback.
    unassigned: 'Unassigned',
    assigned: 'To pick up',
    picked_up: 'Picked up',
    out_for_delivery: 'On the way',
    delivery_failed: 'Attempt failed',
    returning_to_seller: 'Return to seller',
    returned_to_seller: 'Returned',
    delivered: 'Delivered',
    cancelled: 'Cancelled before pickup',
  },
} as const satisfies Readonly<Record<'admin' | 'agent', Labels<ShipmentStatus>>>;

/** Admin view: spec 03 §4.3. Agent view: spec 04 §4.2. */
export const ATTEMPT_FAILURE_REASON_LABELS = {
  admin: {
    customer_unreachable: 'Customer unreachable',
    customer_refused: 'Customer refused',
    wrong_address: 'Wrong address',
    customer_rescheduled: 'Customer rescheduled',
  },
  agent: {
    customer_unreachable: 'Customer unreachable',
    customer_refused: 'Customer refused the parcel',
    wrong_address: 'Wrong address',
    customer_rescheduled: 'Customer asked for another time',
  },
} as const satisfies Readonly<Record<'admin' | 'agent', Labels<AttemptFailureReason>>>;

/** Spec 03 AD-09 tab names. */
export const AGENT_STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
} as const satisfies Labels<AgentStatus>;
