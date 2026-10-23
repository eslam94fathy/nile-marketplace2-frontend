import { ErrorState } from '@nile/ui';
import Link from 'next/link';
import { CATALOG_COPY, CategoryTiles, LISTING_PARAMS, ProductGrid } from '@/features/catalog';
import { ROUTES } from '@/lib/routes';
import { getNewArrivals } from '@/lib/server/catalog';
import { getCategoryTree } from '@/lib/server/categories';

// SF-01 Home (v1.1: no search box of its own, the header's is on every page). No own title: the root layout's default ("Nile") is the home page title. A title template only
// applies to child segments, so a title here would replace the brand instead of extending it. Each section
// catches its own data failure, so one failing section doesn't take the page down (spec 01 SF-01 states).

async function ShopByCategory() {
  const tree = await getCategoryTree().catch(() => null);
  if (tree === null) return <ErrorState message={CATALOG_COPY.categoriesFailed} />;
  return <CategoryTiles tree={tree} />;
}

async function NewArrivals() {
  const products = await getNewArrivals().catch(() => null);
  return (
    <section aria-labelledby="new-arrivals" className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="new-arrivals" className="text-xl font-semibold">
          {CATALOG_COPY.newArrivals}
        </h2>
        <Link
          href={{ pathname: ROUTES.search, query: { [LISTING_PARAMS.sort]: 'newest' } }}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {CATALOG_COPY.seeAll}
        </Link>
      </div>
      {products === null ? (
        <ErrorState message={CATALOG_COPY.productsFailed} />
      ) : products.length === 0 ? (
        <p className="text-muted-foreground">{CATALOG_COPY.newArrivalsEmpty}</p>
      ) : (
        <ProductGrid products={products} />
      )}
    </section>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-10">
      <h1 className="sr-only">{CATALOG_COPY.home}</h1>
      <ShopByCategory />
      <NewArrivals />
    </div>
  );
}
