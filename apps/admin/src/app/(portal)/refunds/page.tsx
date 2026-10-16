import type { Metadata } from 'next';
import { RefundQueue } from '@/features/payments';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Refunds' };

/** AD-16 Refund queue: filters from the URL; the signed-in admin's id lets "recorded by" say "you". */
export default async function RefundsPage({ searchParams }: PageProps<'/refunds'>) {
  const { user } = await requireSession();
  return <RefundQueue params={await searchParams} currentUserId={user.id} />;
}
