import type { CouponDisplayStatus, CouponFunding, CouponScope, DiscountType } from '../enums';
import type { Labels } from './types';

/** Spec 02 §8.6 and spec 03 §7.6. */
export const COUPON_DISPLAY_STATUS_LABELS = {
  scheduled: 'Scheduled',
  active: 'Active',
  expired: 'Expired',
  inactive: 'Inactive',
} as const satisfies Labels<CouponDisplayStatus>;

/** Spec 03 §7.6. */
export const COUPON_FUNDING_LABELS = {
  platform: 'Nile',
  seller: 'Seller',
} as const satisfies Labels<CouponFunding>;

/** Spec 02 SE-22 and spec 03 §7.6. */
export const DISCOUNT_TYPE_LABELS = {
  percent: 'Percent',
  fixed: 'Fixed amount',
} as const satisfies Labels<DiscountType>;

/** Seller view: spec 02 SE-21/22 (seller coupons never use `all`). Admin view: spec 03 §7.6. */
export const COUPON_SCOPE_LABELS = {
  seller: { all: 'All products', seller: 'All your products', category: 'One category' },
  admin: { all: 'All products', seller: 'One seller', category: 'One category' },
} as const satisfies Readonly<Record<'seller' | 'admin', Labels<CouponScope>>>;
