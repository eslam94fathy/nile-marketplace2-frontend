import { defineFactory, fixtureId } from '../factory';

/**
 * `OrderDetailDto`: a placed cash-on-delivery order of 500.00 + 45.00 delivery to governorate `fixtureId(1)`,
 * with no seller orders; tests add the seller orders they are about.
 */
export const orderDetailFactory = defineFactory<'OrderDetailDto'>((sequence) => ({
  id: fixtureId(0x2000 + sequence),
  orderNumber: `NM-2026-${String(sequence).padStart(6, '0')}`,
  status: 'placed',
  paymentMethod: 'cod',
  paymentStatus: 'pending',
  itemsTotal: '500.00',
  deliveryFee: '45.00',
  total: '545.00',
  shippingAddress: {
    recipientName: 'Mona Adel',
    recipientPhone: '+201001234567',
    governorateId: fixtureId(1),
    governorateName: 'Cairo',
    city: 'Nasr City',
    area: 'District 7',
    street: 'Abbas El Akkad',
    building: '12',
    floor: null,
    apartment: null,
    landmark: null,
  },
  sellerOrders: [],
  coupon: null,
  paymentExpiresAt: null,
  placedAt: '2026-10-15T10:00:00.000Z',
  completedAt: null,
  cancelledAt: null,
  createdAt: '2026-10-15T10:00:00.000Z',
}));
