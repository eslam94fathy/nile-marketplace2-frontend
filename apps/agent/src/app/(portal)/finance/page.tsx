import type { Metadata } from 'next';
import { FinanceView } from '@/features/finance';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Finance' };

/** AG-07 Finance: the tab and date range come from the URL. */
export default async function FinancePage({ searchParams }: PageProps<'/finance'>) {
  await requireSession();
  return <FinanceView params={await searchParams} />;
}
