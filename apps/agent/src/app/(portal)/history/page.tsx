import type { Metadata } from 'next';
import { History } from '@/features/shipments';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'History' };

/** AG-06 History: the date range comes from the URL. */
export default async function HistoryPage({ searchParams }: PageProps<'/history'>) {
  await requireSession();
  return <History params={await searchParams} />;
}
