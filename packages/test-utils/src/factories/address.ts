import { defineFactory, fixtureId } from '../factory';

/** `AddressDto`: a complete, non-default address in governorate `fixtureId(1)`; override what the test is about. */
export const addressFactory = defineFactory<'AddressDto'>((sequence) => ({
  id: fixtureId(0x1000 + sequence),
  label: `Address ${sequence}`,
  recipientName: 'Mona Adel',
  recipientPhone: '+201001234567',
  governorateId: fixtureId(1),
  city: 'Nasr City',
  area: 'District 7',
  street: 'Abbas El Akkad',
  building: `${sequence}`,
  floor: null,
  apartment: null,
  landmark: null,
  isDefault: false,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
}));
