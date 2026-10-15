// Public interface of the addresses feature: the address form and display helpers (checkout now, T-G2's
// address book later).
export { addressesQuery, addressKeys, MAX_ADDRESSES, type Address, type Governorate } from './api';
export { AddressForm } from './components/address-form';
export { ADDRESS_COPY } from './copy';
export { addressLines, governorateById, isDeliverable } from './lib/address-text';
