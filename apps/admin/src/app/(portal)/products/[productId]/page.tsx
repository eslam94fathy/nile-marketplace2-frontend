import type { Metadata } from 'next';
import { ProductDetail } from '@/features/products';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Product' };

/** AD-27 Product: reached from orders, the seller's store on AD-05 and reviews (AD-Q-11). */
export default async function ProductPage({ params }: PageProps<'/products/[productId]'>) {
  await requireSession();
  return <ProductDetail productId={(await params).productId} />;
}
