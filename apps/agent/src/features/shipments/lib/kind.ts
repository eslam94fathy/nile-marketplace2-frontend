import { SHIPMENT_STATUS_LABELS } from '@nile/domain';
import type { AgentShipment } from '../api';

// A return pickup runs from the customer (`dropoff`) to the seller (`pickup`): the DTO keeps both parties by role
// for both kinds [VERIFIED backend spec 11 DE-26], so the screens choose the order and wording by `kind`.

export const isReturnPickup = (shipment: Pick<AgentShipment, 'kind'>): boolean => shipment.kind === 'return';

/** Status labels: a return reads "Collected — take to the seller" / "Handed to the seller" (spec 04 §7.5). */
export const statusLabelsOf = (shipment: Pick<AgentShipment, 'kind'>) =>
  isReturnPickup(shipment) ? SHIPMENT_STATUS_LABELS.agentReturn : SHIPMENT_STATUS_LABELS.agent;
