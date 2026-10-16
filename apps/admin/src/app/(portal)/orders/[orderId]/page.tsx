import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Order' };

/** AD-15 Order: linked from AD-13 since T-H9, built in T-H10. */
export default async function OrderPage() {
  await requireSession();
  return <PlaceholderScreen title="Order" task="T-H10" />;
}
