import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Finance' };

export default async function FinancePage() {
  await requireSession();
  return <PlaceholderScreen title="Finance" task="T-H5" />;
}
