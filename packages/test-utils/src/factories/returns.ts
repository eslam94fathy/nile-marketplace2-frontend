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

/**
 * `AdminReturnDto` (ids from 21500): a damaged return of one unit the seller rejected and the customer
 * escalated, waiting for Nile's decision. Items have ids from 21700.
 */
export const adminReturnFactory = defineFactory<'AdminReturnDto'>((sequence) => ({
  id: fixtureId(21500 + sequence),
  returnNumber: `RT-${String(21500 + sequence)}`,
  orderId: fixtureId(21600 + sequence),
  orderNumber: `NM-${String(21600 + sequence)}`,
  sellerOrderId: fixtureId(21650 + sequence),
  customerId: fixtureId(21800 + sequence),
  sellerId: fixtureId(21850 + sequence),
  agentId: null,
  payoutMethod: null,
  status: 'escalated',
  reason: 'damaged',
  description: 'The handle broke.',
  items: [
    {
      id: fixtureId(21700 + sequence),
      orderItemId: fixtureId(21750 + sequence),
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
  sellerDecisionDeadlineAt: null,
  escalationDeadlineAt: null,
  inspectionDeadlineAt: null,
  rejectionReason: 'Used item.',
  refusalReason: null,
  timeline: [
    { status: 'requested', at: '2026-10-28T10:00:00.000Z' },
    { status: 'rejected', at: '2026-10-29T10:00:00.000Z' },
    { status: 'escalated', at: '2026-10-29T12:00:00.000Z' },
  ],
  history: [
    {
      from: null,
      to: 'requested',
      actorRole: 'customer',
      actorUserId: fixtureId(21800 + sequence),
      reason: null,
      at: '2026-10-28T10:00:00.000Z',
    },
    {
      from: 'requested',
      to: 'rejected',
      actorRole: 'seller',
      actorUserId: null,
      reason: 'Used item.',
      at: '2026-10-29T10:00:00.000Z',
    },
    {
      from: 'rejected',
      to: 'escalated',
      actorRole: 'customer',
      actorUserId: fixtureId(21800 + sequence),
      reason: null,
      at: '2026-10-29T12:00:00.000Z',
    },
  ],
  createdAt: '2026-10-28T10:00:00.000Z',
  refund: null,
}));
