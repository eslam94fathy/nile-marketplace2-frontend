import type { AdminAgent } from '@/features/lookups';
import type { AdminShipment } from '../api';

// AD-13 assign dialog rules (spec 03, SPEC 11 Q-41/S-18, UC-DE-4).

/** (Re)assignment exists only before pickup [SPEC 11 Q-41, S-18]. */
export const isAssignable = (shipment: Pick<AdminShipment, 'status'>): boolean =>
  shipment.status === 'unassigned' || shipment.status === 'assigned';

/**
 * Where the agent collects the parcel: the seller for a delivery, the customer (`dropoff`) for a return (the DTO
 * keeps each address by party, SPEC 11 DE-26; auto-assignment keys on the same governorate, DE-17).
 */
export const collectionGovernorateId = (shipment: Pick<AdminShipment, 'kind' | 'pickup' | 'dropoff'>) =>
  shipment.kind === 'return' ? shipment.dropoff.governorateId : shipment.pickup.governorateId;

/**
 * The agents to offer: active ones (the query asks for them) except the current agent; agents based in the
 * collection governorate **and** on shift first, the rest after, each group in the API's order.
 */
export function assignCandidates(
  agents: readonly AdminAgent[],
  shipment: Pick<AdminShipment, 'agentId' | 'kind' | 'pickup' | 'dropoff'>,
): AdminAgent[] {
  const offered = agents.filter((agent) => agent.status === 'active' && agent.id !== shipment.agentId);
  const here = collectionGovernorateId(shipment);
  const preferred = (agent: AdminAgent) => agent.onShift && agent.homeGovernorateId === here;
  return [...offered.filter(preferred), ...offered.filter((agent) => !preferred(agent))];
}
