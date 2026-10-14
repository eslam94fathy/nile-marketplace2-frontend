import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';

export const metadata: Metadata = { title: 'Products' };

export default function ProductsPage() {
  return <PlaceholderScreen title="Products" task="T-H2" />;
}
