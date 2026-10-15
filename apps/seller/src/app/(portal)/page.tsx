import type { Metadata } from 'next';
import { Overview } from '@/features/profile';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Overview' };

export default async function OverviewPage() {
  await requireSession();
  return <Overview />;
}
