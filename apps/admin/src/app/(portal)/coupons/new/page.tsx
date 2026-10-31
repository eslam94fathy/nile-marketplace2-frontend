import type { Metadata } from 'next';
import { NewCoupon } from '@/features/coupons';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'New coupon' };

/** AD-36 New coupon. */
export default async function NewCouponPage() {
  await requireSession();
  return <NewCoupon />;
}
