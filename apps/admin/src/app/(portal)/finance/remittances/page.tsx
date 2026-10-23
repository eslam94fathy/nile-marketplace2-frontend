import type { Metadata } from 'next';
import { Remittances } from '@/features/finance';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'COD remittances' };

/** AD-20 COD remittances: filters from the URL; the signed-in admin's id lets "confirmed by" say "you". */
export default async function RemittancesPage({ searchParams }: PageProps<'/finance/remittances'>) {
  const { user } = await requireSession();
  return <Remittances params={await searchParams} currentUserId={user.id} />;
}
