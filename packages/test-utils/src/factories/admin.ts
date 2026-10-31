import { defineFactory, fixtureId } from '../factory';

/** `AdminListItemDto`: an active admin who has signed in. Ids start at 9500. */
export const adminListItemFactory = defineFactory<'AdminListItemDto'>((sequence) => ({
  id: fixtureId(9500 + sequence),
  email: `admin${sequence}@example.test`,
  status: 'active',
  emailVerifiedAt: '2026-10-14T09:00:00.000Z',
  lastLoginAt: '2026-10-15T09:00:00.000Z',
  createdAt: '2026-10-14T08:00:00.000Z',
}));

/** `AdminSellerDetailDto`: a seller who verified their email and waits for approval. Ids start at 9600. */
export const adminSellerDetailFactory = defineFactory<'AdminSellerDetailDto'>((sequence) => ({
  id: fixtureId(9600 + sequence),
  businessName: `Admin view shop ${sequence}`,
  email: `shop${sequence}@example.test`,
  contactPhone: '+201112345678',
  status: 'pending_approval',
  commissionRate: '0.1000',
  ratingAvg: null,
  ratingCount: 0,
  pickupGovernorateId: fixtureId(9700),
  createdAt: '2026-10-14T08:00:00.000Z',
  approvedAt: null,
  pickupAddress: {
    governorateId: fixtureId(9700),
    city: 'Cairo',
    area: 'Zamalek',
    street: '26th of July St',
    building: '12',
    landmark: null,
  },
  rejectionReason: null,
  emailVerified: true,
  statusHistory: [
    {
      fromStatus: null,
      toStatus: 'pending_approval',
      reason: null,
      actorUserId: fixtureId(9800 + sequence),
      createdAt: '2026-10-14T08:00:00.000Z',
    },
  ],
  commissionHistory: [],
}));

/** `AdminUserListItemDto` (ids from 23000): an active customer who has signed in. */
export const adminUserFactory = defineFactory<'AdminUserListItemDto'>((sequence) => ({
  id: fixtureId(23000 + sequence),
  email: `user${sequence}@example.test`,
  role: 'customer',
  status: 'active',
  emailVerifiedAt: '2026-10-20T09:00:00.000Z',
  lastLoginAt: '2026-10-30T09:00:00.000Z',
  createdAt: '2026-10-20T08:00:00.000Z',
}));

/** `AdminCustomerDetailDto` (ids from 23500, user ids from 23700): an active customer with two addresses. */
export const adminCustomerDetailFactory = defineFactory<'AdminCustomerDetailDto'>((sequence) => ({
  id: fixtureId(23500 + sequence),
  userId: fixtureId(23700 + sequence),
  email: `customer${sequence}@example.test`,
  firstName: 'Mona',
  lastName: `Ali ${sequence}`,
  phone: '+201012345678',
  userStatus: 'active',
  addressCount: 2,
  createdAt: '2026-10-20T08:00:00.000Z',
}));
