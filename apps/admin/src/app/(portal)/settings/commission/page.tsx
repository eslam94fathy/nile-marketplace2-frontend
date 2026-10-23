import type { Metadata } from 'next';
import { CommissionSettings } from '@/features/commission';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Commission' };

export default async function CommissionPage() {
  await requireSession();
  return <CommissionSettings />;
}
