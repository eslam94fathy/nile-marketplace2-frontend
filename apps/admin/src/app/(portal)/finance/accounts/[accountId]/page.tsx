import type { Metadata } from 'next';
import { Statement } from '@/features/finance';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Account statement' };

/** AD-19 Account statement: entry filters come from the URL. */
export default async function AccountStatementPage({
  params,
  searchParams,
}: PageProps<'/finance/accounts/[accountId]'>) {
  await requireSession();
  return <Statement accountId={(await params).accountId} params={await searchParams} />;
}
