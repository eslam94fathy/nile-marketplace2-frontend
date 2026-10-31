import { PageHeader } from '@nile/ui';
import { COUPONS_COPY as COPY } from '../copy';
import { CouponForm } from './coupon-form';

/** AD-36 New coupon: a platform-funded coupon (spec 03 §7.6). */
export function NewCoupon() {
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.newTitle} />
      <CouponForm mode="create" />
    </div>
  );
}
