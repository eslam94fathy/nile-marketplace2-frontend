import type { Metadata } from 'next';
import { Dashboard } from '@/features/dashboard';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function DashboardPage() {
  await requireSession();
  return <Dashboard />;
}
