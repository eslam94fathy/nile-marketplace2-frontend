import { dehydrate, getQueryClient, HydrationBoundary } from '@nile/query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  CATALOG_COPY,
  categoryOptions,
  findCategoryPath,
  LISTING_PARAMS,
  ProductBrowser,
  SellerHeader,
  type CategoryNode,
} from '@/features/catalog';
import { sellerPath } from '@/lib/routes';
import { getSeller, loadListing } from '@/lib/server/catalog';
import { getCategoryTree } from '@/lib/server/categories';

export async function generateMetadata({ params }: PageProps<'/s/[sellerId]'>): Promise<Metadata> {
  const seller = await getSeller((await params).sellerId);
  if (seller === null) return { title: CATALOG_COPY.sellerUnavailable };
  return { title: seller.businessName, alternates: { canonical: sellerPath(seller.id) } };
}

/**
 * SF-22 Seller page: the seller from `GET /sellers/{id}` (cached 5 min), then the SF-04 listing fixed to this
 * seller (`sellerId[eq]`), first page server-rendered. A seller that isn't approved is a 404.
 */
export default async function SellerPage({ params, searchParams }: PageProps<'/s/[sellerId]'>) {
  const seller = await getSeller((await params).sellerId);
  if (seller === null) notFound();
  // The route is the seller: a `seller=` parameter means nothing here and is never trusted.
  const rest = Object.fromEntries(
    Object.entries(await searchParams).filter(([key]) => key !== LISTING_PARAMS.seller),
  );
  const tree = await getCategoryTree().catch((): CategoryNode[] => []);
  const slug = typeof rest.category === 'string' ? rest.category : null;
  const category = slug === null ? null : (findCategoryPath(tree, slug)?.at(-1) ?? null);
  const { listing, query, attributes } = await loadListing(
    { ...rest, [LISTING_PARAMS.seller]: seller.id },
    category,
  );
  return (
    <div className="space-y-8">
      <SellerHeader seller={seller} />
      <HydrationBoundary state={dehydrate(getQueryClient())}>
        <ProductBrowser
          listing={listing}
          query={query}
          basePath={sellerPath(seller.id)}
          attributes={attributes}
          categoryOptions={categoryOptions(tree)}
        />
      </HydrationBoundary>
    </div>
  );
}
