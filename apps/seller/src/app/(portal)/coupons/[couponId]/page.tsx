import type { Metadata } from 'next';
import { CouponView } from '@/features/coupons';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Coupon' };

/** SE-23 Coupon: fetched on the client (another seller's coupon is "not found"). */
export default async function CouponPage({ params }: PageProps<'/coupons/[couponId]'>) {
  await requireSession();
  return <CouponView couponId={(await params).couponId} />;
}
