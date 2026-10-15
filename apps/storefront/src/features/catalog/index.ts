// Public interface of the catalog feature (CLAUDE.md §2.1 rule 3): category navigation and pages (T-E1);
// listings, search and product pages arrive with T-E2/T-E3. Server-side loading is in src/lib/server.
export { CategoriesMenu } from './components/categories-menu';
export { CategoryHeader } from './components/category-header';
export { CategoryTiles } from './components/category-tiles';
export { CATALOG_COPY } from './copy';
export { categoryHref } from './lib/category-href';
export { findCategoryPath, type CategoryNode } from './lib/category-tree';
