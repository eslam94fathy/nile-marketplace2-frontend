// Catalog copy (spec 01 §2.2, SF-01, SF-02).
export const CATALOG_COPY = {
  categories: 'Categories',
  categoriesLoading: 'Loading categories…',
  categoriesFailed: "Categories couldn't be loaded.",
  noCategories: 'No categories yet.',
  showSubcategories: (name: string) => `Show subcategories of ${name}`,
  breadcrumb: 'Breadcrumb',
  home: 'Home',
  subcategories: 'Subcategories',
  shopByCategory: 'Shop by category',
  newArrivals: 'New arrivals',
} as const;
