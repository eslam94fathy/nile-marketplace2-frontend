import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Products' };

export default async function ProductsPage() {
  await requireSession();
  return <PlaceholderScreen title="Products" task="T-H2" />;
}
