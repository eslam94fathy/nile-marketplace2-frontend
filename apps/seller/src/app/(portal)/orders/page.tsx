import type { Metadata } from 'next';
import { ORDER_TAB_PARAM, OrdersList } from '@/features/orders';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Orders' };

/** SE-14 Orders: the tab comes from `?tab=`; the list is fetched on the client. */
export default async function OrdersPage({ searchParams }: PageProps<'/orders'>) {
  await requireSession();
  const tab = (await searchParams)[ORDER_TAB_PARAM];
  return <OrdersList tab={typeof tab === 'string' ? tab : null} />;
}
