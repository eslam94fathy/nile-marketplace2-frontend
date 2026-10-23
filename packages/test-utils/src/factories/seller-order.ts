import { defineFactory, fixtureId } from '../factory';

/**
 * `SellerOrderDto` (seller view): a new cash-on-delivery order to confirm, one line of 2 × 150.00 at 10 %
 * commission, deadline 24 h after creation. Ids start at 7000 so they never collide with other factories.
 */
export const sellerOrderFactory = defineFactory<'SellerOrderDto'>((sequence) => ({
  id: fixtureId(7000 + sequence),
  orderId: fixtureId(7500 + sequence),
  orderNumber: `NM-2026-${String(100000 + sequence)}`,
  status: 'placed',
  paymentMethod: 'cod',
  subtotal: '300.00',
  commissionRate: '0.1000',
  commission: '30.00',
  sellerNet: '270.00',
  items: [
    {
      id: fixtureId(7800 + sequence),
      productId: fixtureId(2000 + sequence),
      variantId: fixtureId(4000 + sequence),
      productName: `Ordered product ${sequence}`,
      sku: `SKU-${sequence}`,
      attributes: [{ attribute: 'Size', value: 'M' }],
      unitPrice: '150.00',
      quantity: 2,
      cancelledQuantity: 0,
      lineTotal: '300.00',
    },
  ],
  dropoffGovernorate: { id: fixtureId(3500), name: 'Giza' },
  acceptDeadlineAt: '2026-10-16T10:00:00.000Z',
  cancelReason: null,
  acceptedAt: null,
  readyAt: null,
  pickedUpAt: null,
  deliveredAt: null,
  returnedAt: null,
  cancelledAt: null,
  createdAt: '2026-10-15T10:00:00.000Z',
}));
