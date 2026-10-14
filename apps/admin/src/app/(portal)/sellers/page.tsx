import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Sellers' };

export default async function SellersPage() {
  await requireSession();
  return <PlaceholderScreen title="Sellers" task="T-H7" />;
}
