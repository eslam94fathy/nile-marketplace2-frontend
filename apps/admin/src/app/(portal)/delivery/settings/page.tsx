import type { Metadata } from 'next';
import { DeliverySettingsView } from '@/features/delivery';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Delivery settings' };

/** AD-08 Governorates and agent share: fetched on the client. */
export default async function DeliverySettingsPage() {
  await requireSession();
  return <DeliverySettingsView />;
}
