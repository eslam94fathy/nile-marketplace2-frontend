import { formatMoney, ratePercentValue } from '@nile/domain';
import type { CategoryChoice } from '@/features/products';
import type { Coupon, CouponStatusFilter } from '../api';
import { COUPONS_COPY as COPY } from '../copy';

// SE-21 row texts (spec 02 §8.3) and the `?status=` filter.

export const COUPON_STATUS_PARAM = 'status';

export function couponStatusFilter(param: string | null | undefined): CouponStatusFilter {
  return param === 'active' || param === 'inactive' ? param : null;
}

/** "10 %, up to EGP 50.00" / "EGP 25.00 off". */
export function discountText(coupon: Coupon): string {
  if (coupon.discountType === 'fixed') return COPY.fixedDiscount(formatMoney(coupon.discountValue));
  return COPY.percentDiscount(
    ratePercentValue(coupon.discountValue),
    coupon.maxDiscount === null ? null : formatMoney(coupon.maxDiscount),
  );
}

/** "All your products" or the category's path; a category no longer in the tree is "Unavailable category". */
export function scopeText(coupon: Coupon, choices: readonly CategoryChoice[], allLabel: string): string {
  if (coupon.scope !== 'category' || coupon.scopeCategoryId === null) return allLabel;
  return choices.find((choice) => choice.id === coupon.scopeCategoryId)?.path ?? COPY.unavailableCategory;
}
