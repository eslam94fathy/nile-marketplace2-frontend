import type { Schema } from '@nile/api';

// The public category tree (`GET /categories`: active categories only, at most 3 levels, ordered as the API
// returns them). There is no category-by-slug endpoint, so pages resolve a slug from the tree
// (api-inventory §10, spec 01 SF-02).

export type CategoryNode = Schema<'CategoryNodeDto'>;

/** The category with `slug` and its ancestors, root first (`[Sports, Running, Running Shoes]`), or null. */
export function findCategoryPath(tree: readonly CategoryNode[], slug: string): CategoryNode[] | null {
  for (const node of tree) {
    if (node.slug === slug) return [node];
    const below = findCategoryPath(node.children, slug);
    if (below !== null) return [node, ...below];
  }
  return null;
}
