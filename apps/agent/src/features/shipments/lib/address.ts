import type { AgentShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';

// Addresses as one line for the screen and for "Open in maps" (spec 04 AG-05, AG-Q-3).

/**
 * The maps search link: opened only by the agent's tap, it sends the address text to the maps service
 * (AG-Q-3). The universal Google Maps URL opens the maps app on phones and the web elsewhere.
 */
const MAPS_SEARCH_URL = 'https://www.google.com/maps/search/?api=1&query=';

export const mapsUrl = (address: string): string => `${MAPS_SEARCH_URL}${encodeURIComponent(address)}`;

/** Pickup: building street, area, city, landmark. No governorate name in the agent DTO (only its id). */
export function pickupAddress(pickup: AgentShipment['pickup']): string {
  return [
    `${pickup.building} ${pickup.street}`,
    pickup.area,
    pickup.city,
    ...(pickup.landmark === null ? [] : [pickup.landmark]),
  ].join(', ');
}

/** Drop-off: building street, floor, apartment, area, city, governorate, landmark. */
export function dropoffAddress(dropoff: AgentShipment['dropoff']): string {
  return [
    `${dropoff.building} ${dropoff.street}`,
    ...(dropoff.floor === null ? [] : [COPY.floor(dropoff.floor)]),
    ...(dropoff.apartment === null ? [] : [COPY.apartment(dropoff.apartment)]),
    dropoff.area,
    dropoff.city,
    dropoff.governorateName,
    ...(dropoff.landmark === null ? [] : [dropoff.landmark]),
  ].join(', ');
}
