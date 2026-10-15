import { dehydrate, getQueryClient, HydrationBoundary } from '@nile/query';
import { PageHeader } from '@nile/ui';
import type { InfiniteData } from '@tanstack/react-query';
import type { Metadata } from 'next';
import {
  CATALOG_COPY,
  catalogKeys,
  categoryOptions,
  findCategoryPath,
  ProductBrowser,
  type CategoryNode,
  type ProductListItem,
  type ResolvedListing,
  type SearchParams,
} from '@/features/catalog';
import { loadListing } from '@/lib/server/catalog';
import { getCategoryTree } from '@/lib/server/categories';

/** SF-03 title: the search text, else the seller's name from the first result, else "All products". */
function title(listing: ResolvedListing, firstProduct: ProductListItem | undefined): string {
  if (listing.q !== null) return CATALOG_COPY.resultsFor(listing.q);
  if (listing.seller !== null) {
    return firstProduct === undefined
      ? CATALOG_COPY.sellerProducts
      : CATALOG_COPY.productsFrom(firstProduct.seller.businessName);
  }
  return CATALOG_COPY.allProducts;
}

async function searchPage(params: SearchParams) {
  const tree = await getCategoryTree().catch((): CategoryNode[] => []);
  const slug = typeof params.category === 'string' ? params.category : null;
  const category = slug === null ? null : (findCategoryPath(tree, slug)?.at(-1) ?? null);
  const loaded = await loadListing(params, category);
  const firstPage = getQueryClient().getQueryData<InfiniteData<{ data: ProductListItem[] }>>(
    catalogKeys.products(loaded.query),
  )?.pages[0];
  return { ...loaded, tree, title: title(loaded.listing, firstPage?.data[0]) };
}

export async function generateMetadata({ searchParams }: PageProps<'/search'>): Promise<Metadata> {
  return { title: (await searchPage(await searchParams)).title };
}

/** SF-03 Search results: first page server-rendered, then filters, sort and "Load more" on the client. */
export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const page = await searchPage(await searchParams);
  return (
    <div className="space-y-6">
      <PageHeader title={page.title} />
      <HydrationBoundary state={dehydrate(getQueryClient())}>
        <ProductBrowser
          listing={page.listing}
          query={page.query}
          basePath="/search"
          attributes={page.attributes}
          categoryOptions={categoryOptions(page.tree)}
        />
      </HydrationBoundary>
    </div>
  );
}
