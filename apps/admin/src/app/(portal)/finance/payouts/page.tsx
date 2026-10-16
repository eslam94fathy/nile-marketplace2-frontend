import type { Metadata } from 'next';
import { Payouts } from '@/features/finance';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Payouts' };

/** AD-21 Payouts: filters from the URL; the signed-in admin's id lets "recorded by" say "you". */
export default async function PayoutsPage({ searchParams }: PageProps<'/finance/payouts'>) {
  const { user } = await requireSession();
  return <Payouts params={await searchParams} currentUserId={user.id} />;
}
