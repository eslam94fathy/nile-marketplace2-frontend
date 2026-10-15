import type { Address, Governorate } from '../api';
import { ADDRESS_COPY } from '../copy';

/** `building, street, area, city, governorate` then floor / apartment / landmark when present (spec 01 SF-16). */
export function addressLines(
  address: Address,
  governorateName: string | null,
): { main: string; extra: string | null } {
  const main = [address.building, address.street, address.area, address.city, governorateName]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ');
  const extra = [
    address.floor === null ? null : ADDRESS_COPY.floor(address.floor),
    address.apartment === null ? null : ADDRESS_COPY.apartment(address.apartment),
    address.landmark,
  ]
    .filter((part): part is string => part !== null && part !== '')
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
