import type { Metadata } from 'next';
import { OrderDetail } from '@/features/orders';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Order' };

/** SE-15 Order: fetched on the client (another seller's order is "not found"). */
export default async function OrderPage({ params }: PageProps<'/orders/[sellerOrderId]'>) {
  await requireSession();
  return <OrderDetail sellerOrderId={(await params).sellerOrderId} />;
}
