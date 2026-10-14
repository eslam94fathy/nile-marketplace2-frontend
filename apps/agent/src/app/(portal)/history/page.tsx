import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'History' };

export default async function HistoryPage() {
  await requireSession();
  return <PlaceholderScreen title="History" task="T-H12" />;
}
