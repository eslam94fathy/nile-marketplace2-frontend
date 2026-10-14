import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage() {
  await requireSession();
  return <PlaceholderScreen title="Orders" task="T-H4" />;
}
