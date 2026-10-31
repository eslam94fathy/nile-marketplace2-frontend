import type { Metadata } from 'next';
import { RefundDetail } from '@/features/payments';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Refund' };

/** AD-34 Refund: the signed-in admin's id lets "recorded by" say "you". */
export default async function RefundPage({ params }: PageProps<'/refunds/[refundId]'>) {
  const { user } = await requireSession();
  return <RefundDetail refundId={(await params).refundId} currentUserId={user.id} />;
}
