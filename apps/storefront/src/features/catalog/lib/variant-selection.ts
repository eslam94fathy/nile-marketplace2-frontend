import type { Schema } from '@nile/api';

// Variant selection on the product page (spec 01 SF-05). A selection maps attribute codes to option codes;
// the selected variant is the one whose options match it exactly. Pure functions, unit-tested.

export type ProductDetail = Schema<'ProductDetailDto'>;
export type ProductVariant = Schema<'ProductVariantDto'>;
export type Selection = Readonly<Record<string, string>>;

/** The cart allows at most 99 of one item (spec 01 SF-05 stepper, [SPEC 08 CT-4]). */
export const MAX_QUANTITY_PER_ITEM = 99;

function matches(variant: ProductVariant, selection: Selection): boolean {
  return Object.entries(selection).every(([attributeCode, optionCode]) =>
    variant.options.some(
      (option) => option.attributeCode === attributeCode && option.optionCode === optionCode,
    ),
  );
}

/**
 * The variant the selection points to, or null while incomplete or when the combination doesn't exist.
 * A product without attributes has one default variant (`options: []`), which is always selected.
 */
export function selectedVariant(product: ProductDetail, selection: Selection): ProductVariant | null {
  if (product.attributes.length === 0) {
    return product.variants.length === 1 ? (product.variants[0] ?? null) : null;
  }
  const complete = product.attributes.every((attribute) => Object.hasOwn(selection, attribute.code));
  if (!complete) return null;
  const found = product.variants.filter((variant) => matches(variant, selection));
  return found.length === 1 ? (found[0] ?? null) : null;
}

/**
 * The starting selection: the `?variant=` from the URL when it belongs to the product (shared links, back from
 * sign-in), else every attribute that has exactly one option.
 */
export function initialSelection(product: ProductDetail, variantId: string | null): Record<string, string> {
  const fromUrl =
    variantId === null ? undefined : product.variants.find((variant) => variant.id === variantId);
  if (fromUrl !== undefined) {
    return Object.fromEntries(fromUrl.options.map((option) => [option.attributeCode, option.optionCode]));
  }
  const selection: Record<string, string> = {};
  for (const attribute of product.attributes) {
    const [only, ...others] = attribute.options;
    if (only !== undefined && others.length === 0) selection[attribute.code] = only.code;
  }
  return selection;
}

export type OptionState = 'available' | 'outOfStock' | 'unavailable';

/**
 * An option given the other current selections: `unavailable` when no variant has it together with them
 * (shown disabled, "Not available in this combination"), `outOfStock` when every such variant is out of
 * stock (still selectable), else `available`.
 */
export function optionState(
  product: ProductDetail,
  selection: Selection,
  attributeCode: string,
  optionCode: string,
): OptionState {
  const others = Object.fromEntries(Object.entries(selection).filter(([code]) => code !== attributeCode));
  const candidates = product.variants.filter((variant) =>
    matches(variant, { ...others, [attributeCode]: optionCode }),
  );
  if (candidates.length === 0) return 'unavailable';
  return candidates.some((variant) => variant.inStock) ? 'available' : 'outOfStock';
}

/** The quantity stepper's upper bound for a variant: what's available, at most 99, at least 1. */
export function maxQuantity(variant: ProductVariant): number {
  return Math.max(1, Math.min(variant.availableQuantity, MAX_QUANTITY_PER_ITEM));
}

/** A quantity from the URL (`?qty=`), clamped to 1..max; anything else becomes 1. */
export function parseQuantity(value: string | null, max: number): number {
  if (value === null || !/^\d{1,3}$/.test(value)) return 1;
  return Math.min(Math.max(Number(value), 1), max);
}
