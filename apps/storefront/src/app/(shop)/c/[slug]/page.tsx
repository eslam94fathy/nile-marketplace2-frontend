import { dehydrate, getQueryClient, HydrationBoundary } from '@nile/query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CategoryHeader, findCategoryPath, LISTING_PARAMS, ProductBrowser } from '@/features/catalog';
import { loadListing } from '@/lib/server/catalog';
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
 * or inactive slug is a 404. Products of all descendant categories are listed (the API includes them).
 */
export default async function CategoryPage({ params, searchParams }: PageProps<'/c/[slug]'>) {
  const { slug } = await params;
  const path = await categoryPath(slug);
  const category = path?.at(-1);
  if (path === null || category === undefined) notFound();
  // The route is the category: a `category=` parameter means nothing here.
  const rest = Object.fromEntries(
    Object.entries(await searchParams).filter(([key]) => key !== LISTING_PARAMS.category),
  );
  const { listing, query, attributes } = await loadListing(rest, category);
  return (
    <div className="space-y-8">
      <CategoryHeader path={path} />
      <HydrationBoundary state={dehydrate(getQueryClient())}>
        <ProductBrowser listing={listing} query={query} basePath={`/c/${slug}`} attributes={attributes} />
      </HydrationBoundary>
    </div>
  );
}
