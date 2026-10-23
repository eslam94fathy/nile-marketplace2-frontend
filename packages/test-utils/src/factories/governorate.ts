import { defineFactory, fixtureId } from '../factory';

/** `GovernorateDto`: deliverable by default; pass `{ deliveryFee: null, isDeliverable: false }` for one that isn't. */
export const governorateFactory = defineFactory<'GovernorateDto'>((sequence) => ({
  id: fixtureId(sequence),
  code: `EG-T${sequence}`,
  name: `Test governorate ${sequence}`,
  deliveryFee: '50.00',
  isDeliverable: true,
}));
