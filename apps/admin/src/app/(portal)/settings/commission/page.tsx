import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Commission' };

export default async function CommissionPage() {
  await requireSession();
  return <PlaceholderScreen title="Commission" task="T-H7" />;
}
