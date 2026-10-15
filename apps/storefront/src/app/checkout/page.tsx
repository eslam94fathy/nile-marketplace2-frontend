import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Checkout' };

export default async function CheckoutPage() {
  await requireSession();
  return <PlaceholderScreen title="Checkout" task="T-F3" />;
}
