import type { Metadata } from 'next';
import { OrderDetail } from '@/features/orders';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Order' };

/** AD-15 Order: the signed-in admin's id lets histories say "you". */
export default async function OrderPage({ params }: PageProps<'/orders/[orderId]'>) {
  const { user } = await requireSession();
  return <OrderDetail orderId={(await params).orderId} currentUserId={user.id} />;
}
