import type { Metadata } from 'next';
import { ShipmentsList } from '@/features/shipments';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Shipments' };

/** AD-12 Shipments: filters come from the URL; the list is fetched on the client. */
export default async function ShipmentsPage({ searchParams }: PageProps<'/delivery/shipments'>) {
  await requireSession();
  return <ShipmentsList params={await searchParams} />;
}
