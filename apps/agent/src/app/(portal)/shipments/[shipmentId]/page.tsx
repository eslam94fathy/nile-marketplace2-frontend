import type { Metadata } from 'next';
import { ShipmentView } from '@/features/shipments';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Shipment' };

/** AG-05 Shipment. */
export default async function ShipmentPage({ params }: PageProps<'/shipments/[shipmentId]'>) {
  await requireSession();
  return <ShipmentView shipmentId={(await params).shipmentId} />;
}
