import type { Metadata } from 'next';
import { ORDERS_COPY, OrderDetail } from '@/features/orders';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: ORDERS_COPY.detailTitle };

/** SF-18 Order detail: shell on the server, the order fetched on the client. */
export default async function OrderPage({ params }: PageProps<'/account/orders/[orderId]'>) {
  await requireSession();
  return <OrderDetail orderId={(await params).orderId} />;
}
