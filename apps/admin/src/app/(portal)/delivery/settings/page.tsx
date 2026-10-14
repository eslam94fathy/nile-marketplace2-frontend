import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Delivery settings' };

export default async function DeliverySettingsPage() {
  await requireSession();
  return <PlaceholderScreen title="Delivery settings" task="T-H9" />;
}
