import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Your orders' };

export default async function YourOrdersPage() {
  await requireSession();
  return <PlaceholderScreen title="Your orders" task="T-G3" />;
}
