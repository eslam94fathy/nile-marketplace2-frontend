import type { Metadata } from 'next';
import { ProductsList } from '@/features/products';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Products' };

/** SE-08 Products: filters come from the URL; the list is fetched on the client. */
export default async function ProductsPage({ searchParams }: PageProps<'/products'>) {
  await requireSession();
  return <ProductsList params={await searchParams} />;
}
