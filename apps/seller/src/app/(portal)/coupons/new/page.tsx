import type { Metadata } from 'next';
import { NewCoupon } from '@/features/coupons';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'New coupon' };

/** SE-22 New coupon (approved sellers). */
export default async function NewCouponPage() {
  await requireSession();
  return <NewCoupon />;
}
