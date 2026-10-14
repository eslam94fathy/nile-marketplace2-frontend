import type { AttemptFailureReason, ShipmentStatus } from '../enums';

// Display-only: the agent's actions per shipment status (spec 04 AG-05, backend spec 11 §1.1, §4.2).
// The backend still decides; a stale status ends in `SHIPMENT_INVALID_STATUS_TRANSITION`.

export type AgentShipmentAction =
  'picked_up' | 'start_delivery' | 'start_next_attempt' | 'delivered' | 'delivery_failed' | 'handed_back';

export interface AgentShipmentActions {
  readonly primary: AgentShipmentAction | null;
  readonly secondary: AgentShipmentAction | null;
}

/** The shipment fields the rule reads (a subset of `AgentShipmentDto`). */
export interface AgentShipmentState {
  readonly status: ShipmentStatus;
  readonly attemptCount: number;
  readonly attempts: readonly { readonly reason: AttemptFailureReason }[];
}

/** Backend limit: the third failed attempt sends the parcel back to the seller (spec 04 AG-05 A4). */
export const MAX_DELIVERY_ATTEMPTS = 3;

const NO_ACTIONS: AgentShipmentActions = { primary: null, secondary: null };

/**
 * AG-Q-1 [ASSUMPTION, proved by E2E]: a normal return (refused, or 3 failed attempts) is closed by the
 * seller; any other parcel returning to the seller was cancelled after pickup, and the agent hands it back.
 * `AgentShipmentDto` has no `sellerOrderCancelledAt`, so the case is inferred from the attempts.
 */
export function canHandBackToSeller(shipment: AgentShipmentState): boolean {
  return (
    shipment.status === 'returning_to_seller' &&
    shipment.attemptCount < MAX_DELIVERY_ATTEMPTS &&
    !shipment.attempts.some((attempt) => attempt.reason === 'customer_refused')
  );
}

/** Exactly one primary action per status, plus "Delivery failed" while out for delivery. */
export function agentShipmentActions(shipment: AgentShipmentState): AgentShipmentActions {
  switch (shipment.status) {
    case 'assigned':
      return { primary: 'picked_up', secondary: null };
    case 'picked_up':
      return { primary: 'start_delivery', secondary: null };
    case 'out_for_delivery':
      return { primary: 'delivered', secondary: 'delivery_failed' };
    case 'delivery_failed':
      return { primary: 'start_next_attempt', secondary: null };
    case 'returning_to_seller':
      return canHandBackToSeller(shipment) ? { primary: 'handed_back', secondary: null } : NO_ACTIONS;
    case 'unassigned':
    case 'returned_to_seller':
    case 'delivered':
    case 'cancelled':
      return NO_ACTIONS;
  }
}
