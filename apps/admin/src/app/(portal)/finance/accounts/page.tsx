import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Finance accounts' };

export default async function FinanceAccountsPage() {
  await requireSession();
  return <PlaceholderScreen title="Finance accounts" task="T-H11" />;
}
