import type { ProductStatus, StockMovementType, VariantStatus } from '../enums';
import type { Labels } from './types';

/** Spec 02 §5.3. */
export const PRODUCT_STATUS_LABELS = {
  draft: 'Draft',
  active: 'Published',
  inactive: 'Unpublished',
} as const satisfies Labels<ProductStatus>;

/** Spec 02 §5.3. */
export const VARIANT_STATUS_LABELS = {
  active: 'Active',
  inactive: 'Inactive',
} as const satisfies Labels<VariantStatus>;

/** Spec 02 SE-13. */
export const STOCK_MOVEMENT_TYPE_LABELS = {
  seller_adjustment: 'Stock adjusted by you',
  reserve: 'Reserved for an order',
  release: 'Released (order cancelled or returned)',
  commit: 'Delivered to the customer',
  return_restock: 'Restocked from a customer return',
} as const satisfies Labels<StockMovementType>;
