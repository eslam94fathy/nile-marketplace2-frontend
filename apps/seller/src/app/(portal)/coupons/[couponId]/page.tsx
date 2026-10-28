import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Coupon' };

/** SE-23 Coupon: a notification link target since T-J6 (spec 00 §12.5), built in T-L5. */
export default async function CouponPage() {
  await requireSession();
  return <PlaceholderScreen title="Coupon" task="T-L5" />;
}
