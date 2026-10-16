import type { Metadata } from 'next';
import { AccountsList } from '@/features/finance';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Finance accounts' };

/** AD-18 Finance accounts: filters come from the URL; the list is fetched on the client. */
export default async function FinanceAccountsPage({ searchParams }: PageProps<'/finance/accounts'>) {
  await requireSession();
  return <AccountsList params={await searchParams} />;
}
