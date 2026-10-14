import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage() {
  await requireSession();
  return <PlaceholderScreen title="Overview" task="T-H1" />;
}
