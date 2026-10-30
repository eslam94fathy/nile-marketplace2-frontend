import type { Metadata } from 'next';
import { COUPON_STATUS_PARAM, CouponsList } from '@/features/coupons';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Coupons' };

/** SE-21 Coupons: the status filter comes from `?status=`; the list is fetched on the client. */
export default async function CouponsPage({ searchParams }: PageProps<'/coupons'>) {
  await requireSession();
  const status = (await searchParams)[COUPON_STATUS_PARAM];
  return <CouponsList status={typeof status === 'string' ? status : null} />;
}
