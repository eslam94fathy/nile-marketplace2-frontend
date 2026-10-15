// Address copy (spec 01 SF-07 §1, SF-16).
export const ADDRESS_COPY = {
  floor: (floor: string) => `Floor ${floor}`,
  apartment: (apartment: string) => `Apartment ${apartment}`,
  fields: {
    label: 'Label (e.g. Home)',
    recipientName: 'Recipient name',
    recipientPhone: 'Recipient phone',
    governorate: 'Governorate',
    governoratePlaceholder: 'Choose a governorate',
    city: 'City',
    area: 'Area',
    street: 'Street',
    building: 'Building',
    floor: 'Floor (optional)',
    apartment: 'Apartment (optional)',
    landmark: 'Landmark (optional)',
    isDefault: 'Make this my default address',
  },
  noDeliveryYet: (name: string) => `${name} (no delivery yet)`,
  willBeDefault: 'This will be your default address.',
  save: 'Save address',
  errors: {
    ADDRESS_LIMIT_REACHED: 'You have the maximum of 20 addresses. Edit or delete one in your account.',
    GOVERNORATE_NOT_FOUND: 'This governorate is no longer available. Please choose again.',
  },
} as const;
