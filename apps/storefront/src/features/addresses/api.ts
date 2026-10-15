import { unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The customer's addresses (design 02 §2.2 `me.addresses`): at most 20, default first then newest [SPEC 04].
// Used by checkout (T-F2) and the address book (T-G2).

export type Address = Schema<'AddressDto'>;
export type Governorate = Schema<'GovernorateDto'>;

const ADDRESSES_STALE_TIME_MS = 60_000;

/** Spec 01 SF-16: "You can save up to 20 addresses." [SPEC 04]. */
export const MAX_ADDRESSES = 20;

export const addressKeys = {
  list: () => queryKey('storefront', 'me', 'addresses'),
};

export function addressesQuery() {
  return queryOptions({
    queryKey: addressKeys.list(),
    queryFn: async ({ signal }) => (await unwrap(browserApi.GET('/api/v1/me/addresses', { signal }))).data,
    staleTime: ADDRESSES_STALE_TIME_MS,
  });
}

export async function createAddress(body: Schema<'CreateAddressDto'>): Promise<Address> {
  return (await unwrap(browserApi.POST('/api/v1/me/addresses', { body }))).data;
}

export async function updateAddress(addressId: string, body: Schema<'UpdateAddressDto'>): Promise<Address> {
  return (
    await unwrap(
      browserApi.PATCH('/api/v1/me/addresses/{addressId}', { params: { path: { addressId } }, body }),
    )
  ).data;
}

export async function deleteAddress(addressId: string): Promise<void> {
  await unwrap(browserApi.DELETE('/api/v1/me/addresses/{addressId}', { params: { path: { addressId } } }));
}
