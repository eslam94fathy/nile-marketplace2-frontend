import type { Metadata } from 'next';
import { SellerDetail } from '@/features/sellers';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Seller' };

/** AD-05 Seller: the signed-in admin's id lets histories say "you". */
export default async function SellerPage({ params }: PageProps<'/sellers/[sellerId]'>) {
  const { user } = await requireSession();
  return <SellerDetail sellerId={(await params).sellerId} currentUserId={user.id} />;
}
