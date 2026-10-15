import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Order' };

/** SF-18 Order detail: linked from the order confirmation (T-F3), built in T-G3. */
export default async function OrderPage() {
  await requireSession();
  return <PlaceholderScreen title="Order" task="T-G3" />;
}
