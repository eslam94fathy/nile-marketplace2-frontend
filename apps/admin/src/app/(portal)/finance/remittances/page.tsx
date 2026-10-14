import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'COD remittances' };

export default async function CODRemittancesPage() {
  await requireSession();
  return <PlaceholderScreen title="COD remittances" task="T-H11" />;
}
