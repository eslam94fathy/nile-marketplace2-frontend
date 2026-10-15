import type { Governorate } from '../api';
import { ADDRESS_COPY } from '../copy';

/** The parts shown for a saved address or an order's shipping address (a snapshot of one). */
export interface AddressParts {
  readonly building: string;
  readonly street: string;
  readonly area: string;
  readonly city: string;
  readonly floor?: string | null;
  readonly apartment?: string | null;
  readonly landmark?: string | null;
}

/** `building, street, area, city, governorate` then floor / apartment / landmark when present (spec 01 SF-16). */
export function addressLines(
  address: AddressParts,
  governorateName: string | null,
): { main: string; extra: string | null } {
  const main = [address.building, address.street, address.area, address.city, governorateName]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ');
  const extra = [
    address.floor ? ADDRESS_COPY.floor(address.floor) : null,
    address.apartment ? ADDRESS_COPY.apartment(address.apartment) : null,
    address.landmark,
  ]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');
  return { main, extra: extra === '' ? null : extra };
}

export function governorateById(governorates: readonly Governorate[], id: string): Governorate | null {
  return governorates.find((governorate) => governorate.id === id) ?? null;
}

/** Delivery is possible only where the governorate has a fee (`deliveryFee = null` → not deliverable) [SPEC 11]. */
export function isDeliverable(governorate: Governorate | null): boolean {
  return governorate !== null && governorate.isDeliverable && governorate.deliveryFee !== null;
}
