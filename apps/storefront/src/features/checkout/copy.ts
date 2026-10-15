// Checkout copy (spec 01 SF-07).
export const CHECKOUT_COPY = {
  title: 'Checkout',
  addressHeading: 'Delivery address',
  addressLegend: 'Choose a delivery address',
  default: 'Default',
  notDeliverable: (governorate: string) => `We don't deliver to ${governorate} yet.`,
  thisArea: 'this area',
  addAddress: 'Add a new address',
  summaryHeading: 'Order summary',
  itemsTotal: (count: number) => `Items (${count})`,
  deliveryFee: 'Delivery fee',
  noAddressYet: '—',
  loadFailed: "Checkout couldn't be loaded.",
} as const;
