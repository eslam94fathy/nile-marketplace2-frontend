import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  await requireSession();
  return <PlaceholderScreen title="Dashboard" task="T-H6" />;
}
