import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  await requireSession();
  return <PlaceholderScreen title="New product" task="T-H2" />;
}
