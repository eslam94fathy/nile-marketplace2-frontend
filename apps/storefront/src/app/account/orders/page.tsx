import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';

export const metadata: Metadata = { title: 'Your orders' };

export default function YourOrdersPage() {
  return <PlaceholderScreen title="Your orders" task="T-G3" />;
}
