import type { InvalidationMap } from '@nile/realtime';
import { profileKeys } from '@/features/profile';
import { shipmentKeys } from './api';

/** What each shipment message makes stale for the agent (design 02 §5.3); assignments change the active count. */
export const SHIPMENTS_INVALIDATION = {
  'shipment.updated': ({ shipmentId }) => [
    shipmentKeys.active(),
    shipmentKeys.detail(shipmentId),
    shipmentKeys.history(),
  ],
  'shipment.assigned': ({ shipmentId }) => [
    shipmentKeys.active(),
    shipmentKeys.detail(shipmentId),
    profileKeys.profile(),
  ],
  'shipment.unassigned': ({ shipmentId }) => [
    shipmentKeys.active(),
    shipmentKeys.detail(shipmentId),
    profileKeys.profile(),
  ],
} satisfies InvalidationMap;
