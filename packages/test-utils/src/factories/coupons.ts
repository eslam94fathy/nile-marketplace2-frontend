import { defineFactory, fixtureId } from '../factory';

/**
 * `CouponDto` (ids from 20000): an active, unused seller coupon, 10 % on all the seller's products, valid
 * through 2999, once per customer.
 */
export const couponFactory = defineFactory<'CouponDto'>((sequence) => ({
  id: fixtureId(20000 + sequence),
  code: `SAVE${String(sequence).padStart(2, '0')}`,
  funding: 'seller',
  sellerId: fixtureId(1),
  discountType: 'percent',
  discountValue: '0.1000',
  maxDiscount: null,
  minItemsSubtotal: '0.00',
  scope: 'seller',
  scopeSellerId: null,
  scopeCategoryId: null,
  startsAt: '2026-10-01T07:00:00.000Z',
  endsAt: '2999-01-01T07:00:00.000Z',
  globalLimit: null,
  perCustomerLimit: 1,
  redemptionCount: 0,
  status: 'active',
  displayStatus: 'active',
  adminBlocked: false,
  adminBlockReason: null,
  createdAt: '2026-10-01T07:00:00.000Z',
  updatedAt: '2026-10-01T07:00:00.000Z',
}));
