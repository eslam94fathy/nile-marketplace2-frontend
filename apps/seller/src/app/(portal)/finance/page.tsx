import type { Metadata } from 'next';
import { FINANCE_TAB_PARAM, FinanceView } from '@/features/finance';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Finance' };

/** SE-16 Finance: the tab comes from `?tab=`; the data is fetched on the client. */
export default async function FinancePage({ searchParams }: PageProps<'/finance'>) {
  await requireSession();
  const tab = (await searchParams)[FINANCE_TAB_PARAM];
  return <FinanceView tab={typeof tab === 'string' ? tab : null} />;
}
