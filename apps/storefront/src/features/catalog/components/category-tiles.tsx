import Link from 'next/link';
import { CATALOG_COPY } from '../copy';
import { categoryHref } from '../lib/category-href';
import type { CategoryNode } from '../lib/category-tree';

/** Home "Shop by category" (spec 01 SF-01): one tile per top-level category; hidden when there are none. */
export function CategoryTiles({ tree }: { readonly tree: readonly CategoryNode[] }) {
  if (tree.length === 0) return null;
  return (
    <section aria-labelledby="shop-by-category" className="space-y-4">
      <h2 id="shop-by-category" className="text-xl font-semibold">
        {CATALOG_COPY.shopByCategory}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tree.map((node) => (
          <li key={node.id}>
            <Link
              href={categoryHref(node.slug)}
              className="flex h-full min-h-20 items-center rounded-lg border border-border p-4 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {node.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
