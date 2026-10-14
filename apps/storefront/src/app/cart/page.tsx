import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Cart' };

export default async function CartPage() {
  await requireSession();
  return <PlaceholderScreen title="Cart" task="T-F1" />;
}
