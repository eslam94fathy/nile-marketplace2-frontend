import type { Metadata } from 'next';
import { ProductView } from '@/features/products';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Product' };

/** SE-10 Product: fetched on the client (another seller's product is "not found"). */
export default async function ProductPage({ params }: PageProps<'/products/[productId]'>) {
  await requireSession();
  return <ProductView productId={(await params).productId} />;
}
