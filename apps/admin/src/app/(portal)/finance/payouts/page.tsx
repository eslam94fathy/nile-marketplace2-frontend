import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Payouts' };

export default async function PayoutsPage() {
  await requireSession();
  return <PlaceholderScreen title="Payouts" task="T-H11" />;
}
