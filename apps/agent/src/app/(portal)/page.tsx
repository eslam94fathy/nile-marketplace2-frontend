import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Shipments' };

export default async function ShipmentsPage() {
  await requireSession();
  return <PlaceholderScreen title="Shipments" task="T-H12" />;
}
