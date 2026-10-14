import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Refunds' };

export default async function RefundsPage() {
  await requireSession();
  return <PlaceholderScreen title="Refunds" task="T-H10" />;
}
