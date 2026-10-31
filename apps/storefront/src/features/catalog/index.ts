// Public interface of the catalog feature (CLAUDE.md §2.1 rule 3): category navigation and pages (T-E1);
// listings, search and product pages arrive with T-E2/T-E3. Server-side loading is in src/lib/server.
export { CategoriesMenu } from './components/categories-menu';
export { CategoryHeader } from './components/category-header';
export { SellerHeader, type PublicSeller } from './components/seller-header';
export { CategoryTiles } from './components/category-tiles';
export { catalogKeys, productListOptions } from './api';
export { ProductBrowser, type CategoryOption, type ProductBrowserProps } from './components/product-browser';
export { ProductGrid, type ProductListItem } from './components/product-card';
export { CATALOG_COPY } from './copy';
export {
  LISTING_PARAMS,
  parseListingParams,
  resolveListing,
  toProductQuery,
  type EffectiveAttribute,
  type ResolvedListing,
  type SearchParams,
} from './lib/listing-params';
export { productHref } from './lib/product-href';
export { Breadcrumbs } from './components/breadcrumbs';
export { ProductView } from './components/product-view';
export { PRODUCT_PARAMS } from './lib/product-params';
export type { ProductDetail } from './lib/variant-selection';
export { categoryHref } from './lib/category-href';
export { categoryOptions, findCategoryPath, type CategoryNode } from './lib/category-tree';
