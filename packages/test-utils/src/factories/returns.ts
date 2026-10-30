import { defineFactory, fixtureId } from '../factory';

/**
 * `SellerReturnDto` (ids from 18000): a `requested` damaged return of one unit, the seller paying the fee,
 * deciding within 48 h. Items have ids from 18500.
 */
export const sellerReturnFactory = defineFactory<'SellerReturnDto'>((sequence) => ({
  id: fixtureId(18000 + sequence),
  returnNumber: `RT-${String(sequence)}`,
  orderId: fixtureId(18200 + sequence),
  orderNumber: `NM-${String(sequence)}`,
  sellerOrderId: fixtureId(18300 + sequence),
  status: 'requested',
  reason: 'damaged',
  description: 'The handle broke.',
  items: [
    {
      id: fixtureId(18500 + sequence),
      orderItemId: fixtureId(18600 + sequence),
      productName: 'Linen shirt',
      attributes: [{ attribute: 'Size', value: 'M' }],
      image: null,
      quantity: 1,
      paidAmount: '150.00',
      restock: null,
    },
  ],
  photos: [],
  returnFee: '30.00',
  returnFeePayer: 'seller',
  refundAmount: '150.00',
  sellerDecisionDeadlineAt: '2999-01-01T10:00:00.000Z',
  escalationDeadlineAt: null,
  inspectionDeadlineAt: null,
  rejectionReason: null,
  refusalReason: null,
  timeline: [{ status: 'requested', at: '2026-10-28T10:00:00.000Z' }],
  createdAt: '2026-10-28T10:00:00.000Z',
}));
