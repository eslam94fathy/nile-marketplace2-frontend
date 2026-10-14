import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Addresses' };

export default async function AddressesPage() {
  await requireSession();
  return <PlaceholderScreen title="Addresses" task="T-G2" />;
}
