import type { Metadata } from 'next';
import { CouponsList } from '@/features/coupons';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Coupons' };

/** AD-35 Coupons: filters from the URL; also reached filtered from AD-05. */
export default async function CouponsPage({ searchParams }: PageProps<'/coupons'>) {
  await requireSession();
  return <CouponsList params={await searchParams} />;
}
