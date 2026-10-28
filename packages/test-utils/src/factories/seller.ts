import { defineFactory, fixtureId } from '../factory';

/** `SellerProfileDto`: a seller waiting for approval, as after registration; override `status` for the others. */
export const sellerProfileFactory = defineFactory<'SellerProfileDto'>((sequence) => ({
  id: fixtureId(sequence),
  email: `seller${sequence}@example.test`,
  businessName: `Test shop ${sequence}`,
  contactPhone: '+201112345678',
  ratingAvg: null,
  ratingCount: 0,
  pickupAddress: {
    governorateId: fixtureId(sequence + 1000),
    city: 'Cairo',
    area: 'Zamalek',
    street: '26th of July St',
    building: '12',
    landmark: null,
  },
  status: 'pending_approval',
  rejectionReason: null,
  commissionRate: '0.1000',
  approvedAt: null,
  createdAt: '2026-10-14T08:00:00.000Z',
  updatedAt: '2026-10-14T08:00:00.000Z',
}));
