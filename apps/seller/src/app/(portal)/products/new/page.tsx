import type { Metadata } from 'next';
import { NewProduct } from '@/features/products';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'New product' };

export default async function NewProductPage() {
  await requireSession();
  return <NewProduct />;
}
