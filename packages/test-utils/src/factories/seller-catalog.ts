import { defineFactory, fixtureId } from '../factory';

// Seller catalog DTOs (spec 02 SE-08 … SE-11). Ids start at 2000/3000/4000 so they never collide with the
// other factories' ids in one test.

/** `SellerProductDetailDto`: a new draft without variants, as `POST /seller/products` answers. */
export const sellerProductFactory = defineFactory<'SellerProductDetailDto'>((sequence) => ({
  id: fixtureId(2000 + sequence),
  slug: `test-product-${sequence}-abc123`,
  name: `Test product ${sequence}`,
  description: 'A product for tests.',
  categoryId: fixtureId(3000),
  status: 'draft',
  visible: false,
  minPrice: null,
  maxPrice: null,
  inStock: false,
  primaryImage: null,
  adminBlocked: false,
  adminBlockReason: null,
  publishedAt: null,
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
  variants: [],
  images: [],
}));

/** `SellerProductDto` (list row): a published product with one in-stock variant. */
export const sellerProductListItemFactory = defineFactory<'SellerProductDto'>((sequence) => ({
  id: fixtureId(2500 + sequence),
  slug: `listed-product-${sequence}-abc123`,
  name: `Listed product ${sequence}`,
  description: 'A product for tests.',
  categoryId: fixtureId(3000),
  status: 'active',
  visible: true,
  minPrice: '150.00',
  maxPrice: '150.00',
  inStock: true,
  primaryImage: null,
  adminBlocked: false,
  adminBlockReason: null,
  publishedAt: '2026-10-15T09:00:00.000Z',
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T09:00:00.000Z',
}));

/** `SellerVariantDto`: an active default variant (category without attributes) with 10 on hand. */
export const sellerVariantFactory = defineFactory<'SellerVariantDto'>((sequence) => ({
  id: fixtureId(4000 + sequence),
  sku: `SKU-${sequence}`,
  price: '150.00',
  compareAtPrice: null,
  status: 'active',
  isDefault: true,
  options: [],
  stock: { onHand: 10, reserved: 0, sellable: 10 },
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
}));
