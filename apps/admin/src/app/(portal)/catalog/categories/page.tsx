import type { Metadata } from 'next';
import { CATEGORY_PARAM, CategoriesView } from '@/features/catalog';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Categories' };

/** AD-07 Categories: the selected category comes from `?category=`; the tree is fetched on the client. */
export default async function CategoriesPage({ searchParams }: PageProps<'/catalog/categories'>) {
  await requireSession();
  const selected = (await searchParams)[CATEGORY_PARAM];
  return <CategoriesView initialSelectedId={typeof selected === 'string' ? selected : null} />;
}
