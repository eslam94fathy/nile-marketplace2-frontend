import { UI_COPY } from '@nile/ui';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryHeader, findCategoryPath } from '@/features/catalog';
import { getCategoryTree } from '@/lib/server/categories';

/** The category of `slug` and its ancestors (root first), from the cached tree; null when unknown/inactive. */
async function categoryPath(slug: string) {
  return findCategoryPath(await getCategoryTree(), slug);
}

export async function generateMetadata({ params }: PageProps<'/c/[slug]'>): Promise<Metadata> {
  const current = (await categoryPath((await params).slug))?.at(-1);
  return current === undefined ? {} : { title: current.name };
}

/**
 * SF-02 Category page. The slug is resolved from the active tree (no category-by-slug endpoint), so an unknown
 * or inactive slug is a 404. The product listing with filters arrives with T-E2.
 */
export default async function CategoryPage({ params }: PageProps<'/c/[slug]'>) {
  const path = await categoryPath((await params).slug);
  if (path === null) notFound();
  return (
    <div className="space-y-8">
      <CategoryHeader path={path} />
      <p className="rounded-lg border border-dashed border-input p-6 text-muted-foreground">
        {UI_COPY.placeholder('T-E2')}
      </p>
    </div>
  );
}
