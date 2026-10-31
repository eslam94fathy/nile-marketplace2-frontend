import type { Metadata } from 'next';
import { CouponDetail } from '@/features/coupons';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Coupon' };

/** AD-37 Coupon. */
export default async function CouponPage({ params }: PageProps<'/coupons/[couponId]'>) {
  await requireSession();
  return <CouponDetail couponId={(await params).couponId} />;
}
