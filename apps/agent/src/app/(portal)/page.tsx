import type { Metadata } from 'next';
import { ActiveShipments } from '@/features/shipments';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Shipments' };

/** AG-04 Active shipments: the tab comes from `?tab=`; the lists are fetched (and polled) on the client. */
export default async function ShipmentsPage({ searchParams }: PageProps<'/'>) {
  await requireSession();
  const tab = (await searchParams).tab;
  return <ActiveShipments tab={typeof tab === 'string' ? tab : null} />;
}
