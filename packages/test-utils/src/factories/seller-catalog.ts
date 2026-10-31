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

/** `AdminProductDetailDto` (ids from 24000): a published, visible product of one seller with one variant. */
export const adminProductFactory = defineFactory<'AdminProductDetailDto'>((sequence) => ({
  id: fixtureId(24000 + sequence),
  sellerId: fixtureId(24200 + sequence),
  slug: `admin-product-${sequence}-abc123`,
  name: `Admin product ${sequence}`,
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
  publishedAt: '2026-10-16T08:00:00.000Z',
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-16T08:00:00.000Z',
  variants: [
    {
      id: fixtureId(24500 + sequence),
      sku: `ADM-${sequence}`,
      price: '150.00',
      compareAtPrice: null,
      status: 'active',
      isDefault: true,
      options: [],
      stock: { onHand: 10, reserved: 2, sellable: 8 },
      createdAt: '2026-10-15T08:00:00.000Z',
      updatedAt: '2026-10-15T08:00:00.000Z',
    },
  ],
  images: [],
}));

/** `ProductListItemDto` (ids from 24700): a public listing row of an in-stock product without ratings. */
export const productListItemFactory = defineFactory<'ProductListItemDto'>((sequence) => ({
  id: fixtureId(24700 + sequence),
  slug: `store-product-${sequence}-abc123`,
  name: `Store product ${sequence}`,
  minPrice: '150.00',
  maxPrice: '150.00',
  inStock: true,
  rating: { avg: null, count: 0 },
  category: { id: fixtureId(3000), name: 'Shirts', slug: 'shirts' },
  seller: { id: fixtureId(24900), businessName: 'Nile Crafts' },
  primaryImage: null,
  publishedAt: '2026-10-16T08:00:00.000Z',
}));
