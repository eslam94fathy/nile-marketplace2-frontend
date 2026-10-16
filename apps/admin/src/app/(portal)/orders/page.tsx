import type { Metadata } from 'next';
import { OrdersList } from '@/features/orders';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Orders' };

/** AD-14 Orders: filters come from the URL; the list is fetched on the client. */
export default async function OrdersPage({ searchParams }: PageProps<'/orders'>) {
  await requireSession();
  return <OrdersList params={await searchParams} />;
}
