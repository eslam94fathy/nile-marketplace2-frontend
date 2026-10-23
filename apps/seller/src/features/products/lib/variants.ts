import type { EffectiveAttribute, SellerProduct, SellerVariant } from '../api';
import { PRODUCTS_COPY } from '../copy';
import { optionSignature } from '../schemas';

// Display and decision helpers for the variants of one product (spec 02 SE-10, SE-11).

/** "Size: M · Color: Red", attribute names from the category when known; "Default" for the default variant. */
export function variantOptionsLabel(
  variant: SellerVariant,
  attributes: readonly EffectiveAttribute[],
): string {
  if (variant.isDefault || variant.options.length === 0) return PRODUCTS_COPY.variant.defaultOptions;
  return variant.options
    .map((option) => {
      const name =
        attributes.find((attribute) => attribute.id === option.attributeId)?.name ?? option.attributeCode;
      return `${name}: ${option.value}`;
    })
    .join(' · ');
}

/** Option signatures of the product's variants (deleted variants aren't returned). */
export function takenCombinations(variants: readonly SellerVariant[]): ReadonlySet<string> {
  return new Set(
    variants.map((variant) => optionSignature(variant.options.map((option) => option.optionId))),
  );
}

/**
 * Options of `attributeId` that would complete an existing combination with the other choices made so far
 * (spec 02 SE-11 "Already exists"). Only decidable once every other attribute has a choice.
 */
export function takenOptionIds(
  attributes: readonly EffectiveAttribute[],
  selection: Readonly<Record<string, string>>,
  attributeId: string,
  taken: ReadonlySet<string>,
): ReadonlySet<string> {
  const others = attributes.filter((attribute) => attribute.id !== attributeId);
  const otherIds = others.map((attribute) => selection[attribute.id] ?? '');
  const result = new Set<string>();
  if (otherIds.some((id) => id === '')) return result;
  const attribute = attributes.find((item) => item.id === attributeId);
  for (const option of attribute?.options ?? []) {
    if (taken.has(optionSignature([...otherIds, option.id]))) result.add(option.id);
  }
  return result;
}

/**
 * Turning this variant off (inactive or deleted) hides the product: it is the last active variant of an
 * active product, and the backend then deactivates the product [SPEC 06 UC-CA-3].
 */
export function isLastActiveVariant(product: SellerProduct, variant: SellerVariant): boolean {
  if (product.status !== 'active' || variant.status !== 'active') return false;
  return product.variants.filter((item) => item.status === 'active').length === 1;
}

export const hasActiveVariant = (product: SellerProduct): boolean =>
  product.variants.some((variant) => variant.status === 'active');

/**
 * "Add variant" is offered (spec 02 SE-10 item 5): a category without attributes takes one variant only
 * [SPEC 06 `DEFAULT_VARIANT_EXISTS`]. The 100-variant limit is left to the API (`VARIANT_LIMIT_REACHED`).
 */
export function canAddVariant(product: SellerProduct, attributes: readonly EffectiveAttribute[]): boolean {
  return attributes.length > 0 || product.variants.length === 0;
}

interface OptionProblem {
  readonly value?: string;
}

/**
 * The attributes a `VARIANT_OPTIONS_INVALID` answer is about (its `details[].value` is the refused option
 * id, or the attribute code for a missing choice [VERIFIED `resolveVariantOptions`]). Unknown values (an
 * option or attribute removed since the form loaded) match nothing: the caller reloads the attributes.
 */
export function attributesWithProblems(
  details: readonly OptionProblem[],
  attributes: readonly EffectiveAttribute[],
): string[] {
  const ids = new Set<string>();
  for (const detail of details) {
    const owner = attributes.find(
      (attribute) =>
        attribute.code === detail.value || attribute.options.some((option) => option.id === detail.value),
    );
    if (owner !== undefined) ids.add(owner.id);
  }
  return [...ids];
}
