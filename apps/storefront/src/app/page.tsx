import { ErrorState, UI_COPY } from '@nile/ui';
import { SEARCH_LANDMARKS, SearchBox } from '@/components/shell/search-box';
import { CATALOG_COPY, CategoryTiles } from '@/features/catalog';
import { getCategoryTree } from '@/lib/server/categories';

// SF-01 Home. No own title: the root layout's default ("Nile") is the home page title. A title template only
// applies to child segments, so a title here would replace the brand instead of extending it.

async function ShopByCategory() {
  // One section failing doesn't take the page down (spec 01 SF-01 states): the data call is caught, not the JSX.
  const tree = await getCategoryTree().catch(() => null);
  if (tree === null) return <ErrorState message={CATALOG_COPY.categoriesFailed} />;
  return <CategoryTiles tree={tree} />;
}

export default function HomePage() {
  return (
    <div className="space-y-10">
      <h1 className="sr-only">{CATALOG_COPY.home}</h1>
      <SearchBox large landmarkLabel={SEARCH_LANDMARKS.home} className="mx-auto max-w-2xl" />
      <ShopByCategory />
      <section aria-labelledby="new-arrivals" className="space-y-4">
        <h2 id="new-arrivals" className="text-xl font-semibold">
          {CATALOG_COPY.newArrivals}
        </h2>
        <p className="rounded-lg border border-dashed border-input p-6 text-muted-foreground">
          {UI_COPY.placeholder('T-E2')}
        </p>
      </section>
    </div>
  );
}
