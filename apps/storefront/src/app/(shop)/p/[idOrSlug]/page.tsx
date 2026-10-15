import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';

export const metadata: Metadata = { title: 'Product' };

/** SF-05 arrives with T-E3; this keeps the listing's product links type-checked meanwhile. */
export default function ProductPage() {
  return <PlaceholderScreen title="Product" task="T-E3" />;
}
