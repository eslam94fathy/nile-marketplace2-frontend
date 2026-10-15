import type { Metadata } from 'next';
import { ORDERS_COPY, OrdersList } from '@/features/orders';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: ORDERS_COPY.title };

/** SF-17 Orders: the tab comes from `?status=`; the list is fetched on the client. */
export default async function YourOrdersPage({ searchParams }: PageProps<'/account/orders'>) {
  await requireSession();
  const status = (await searchParams).status;
  return <OrdersList tab={typeof status === 'string' ? status : null} />;
}
