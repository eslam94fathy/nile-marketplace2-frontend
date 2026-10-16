import type { AdminAgent } from '@/features/lookups';
import type { AdminShipment } from '../api';

// AD-13 assign dialog rules (spec 03, SPEC 11 Q-41/S-18, UC-DE-4).

/** (Re)assignment exists only before pickup [SPEC 11 Q-41, S-18]. */
export const isAssignable = (shipment: Pick<AdminShipment, 'status'>): boolean =>
  shipment.status === 'unassigned' || shipment.status === 'assigned';

/**
 * The agents to offer: active ones (the query asks for them) except the current agent; agents based in the
 * pickup governorate **and** on shift first, the rest after, each group in the API's order.
 */
export function assignCandidates(
  agents: readonly AdminAgent[],
  shipment: Pick<AdminShipment, 'agentId' | 'pickup'>,
): AdminAgent[] {
  const offered = agents.filter((agent) => agent.status === 'active' && agent.id !== shipment.agentId);
  const preferred = (agent: AdminAgent) =>
    agent.onShift && agent.homeGovernorateId === shipment.pickup.governorateId;
  return [...offered.filter(preferred), ...offered.filter((agent) => !preferred(agent))];
}
