import { NileImage } from '@nile/ui';
import Link from 'next/link';
import { CATALOG_COPY } from '../copy';
import { categoryHref } from '../lib/category-href';
import type { CategoryNode } from '../lib/category-tree';

const TILE_IMAGE_SIZES = '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw';

/**
 * The first row on a phone (two columns), above the fold on the home page: loaded eagerly with high priority as
 * the likely LCP image (spec 01 §10.3 performance, T-O3). Every other tile loads lazily.
 */
export const PRIORITY_TILES = 2;

/**
 * Home "Shop by category" (spec 01 SF-01, §10.3): one tile per top-level category with its image (placeholder
 * when `null`); hidden when there are none. The image is `alt=""`: the tile's text already names the link.
 */
export function CategoryTiles({ tree }: { readonly tree: readonly CategoryNode[] }) {
  if (tree.length === 0) return null;
  return (
    <section aria-labelledby="shop-by-category" className="space-y-4">
      <h2 id="shop-by-category" className="text-xl font-semibold">
        {CATALOG_COPY.shopByCategory}
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tree.map((node, index) => (
          <li key={node.id}>
            <Link
              href={categoryHref(node.slug)}
              className="flex h-full flex-col gap-2 rounded-lg border border-border p-2 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <NileImage
                image={node.image}
                alt=""
                sizes={TILE_IMAGE_SIZES}
                placeholder="category"
                priority={index < PRIORITY_TILES}
                className="aspect-[4/3] w-full rounded-md bg-muted"
              />
              <span className="px-2 pb-2">{node.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
