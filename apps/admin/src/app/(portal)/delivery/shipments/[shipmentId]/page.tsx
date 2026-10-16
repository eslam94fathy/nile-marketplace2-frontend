import type { Metadata } from 'next';
import { ShipmentDetail } from '@/features/shipments';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Shipment' };

/** AD-13 Shipment: the signed-in admin's id lets the history say "you". */
export default async function ShipmentPage({ params }: PageProps<'/delivery/shipments/[shipmentId]'>) {
  const { user } = await requireSession();
  return <ShipmentDetail shipmentId={(await params).shipmentId} currentUserId={user.id} />;
}
