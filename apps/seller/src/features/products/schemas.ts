import type { Schema } from '@nile/api';
import { fields, parseMoney, VARIANT_STATUSES } from '@nile/domain';
import * as z from 'zod';
import type { EffectiveAttribute, SellerProduct, SellerVariant } from './api';
import { PRODUCTS_COPY } from './copy';

// Product and variant forms (spec 02 SE-09, SE-10-A1, SE-11), mirroring `CreateProductDto`,
// `UpdateProductDto`, `CreateVariantDto` and `UpdateVariantDto` [SPEC 06 §4.3].

export const PRODUCT_NAME_MAX = 200;
export const PRODUCT_DESCRIPTION_MAX = 5000;
const SKU_MAX = 64;
const SKU_PATTERN = /^[A-Za-z0-9._-]+$/;
const INITIAL_STOCK_MAX = 100_000;

// ── Product ───────────────────────────────────────────────────────────────────────────────────────────

export const productSchema = z.object({
  categoryId: z.string().min(1, fields.FIELD_MESSAGES.required),
  name: fields.trimmedString(2, PRODUCT_NAME_MAX),
  description: fields.trimmedString(1, PRODUCT_DESCRIPTION_MAX),
});
export type ProductValues = z.input<typeof productSchema>;
type ProductOutput = z.output<typeof productSchema>;

export const EMPTY_PRODUCT: ProductValues = { categoryId: '', name: '', description: '' };

export function productValues(product: SellerProduct): ProductValues {
  return { categoryId: product.categoryId, name: product.name, description: product.description };
}

export const toCreateProductBody = (values: ProductOutput) =>
  ({
    categoryId: values.categoryId,
    name: values.name,
    description: values.description,
  }) satisfies Schema<'CreateProductDto'>;

/** Only changed fields, compared after trimming; null when nothing changed (the API refuses an empty body). */
export function productPatch(
  values: ProductOutput,
  product: SellerProduct,
): Schema<'UpdateProductDto'> | null {
  const patch: Schema<'UpdateProductDto'> = {
    ...(values.name === product.name ? {} : { name: values.name }),
    ...(values.description === product.description ? {} : { description: values.description }),
    ...(values.categoryId === product.categoryId ? {} : { categoryId: values.categoryId }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}

export function productHasChanges(values: ProductValues, product: SellerProduct): boolean {
  const parsed = productSchema.safeParse(values);
  return !parsed.success || productPatch(parsed.data, product) !== null;
}

// ── Variant ───────────────────────────────────────────────────────────────────────────────────────────

const sku = fields
  .trimmedString(1, SKU_MAX)
  .pipe(z.string().regex(SKU_PATTERN, PRODUCTS_COPY.variant.skuPattern));

/** Empty → null; otherwise money (the "greater than price" rule needs both, see `compareAtRule`). */
const compareAtPrice = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .pipe(fields.money.nullable());

const initialStock = z
  .string()
  .trim()
  .regex(/^\d+$/, PRODUCTS_COPY.variant.stockRange)
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .min(0, PRODUCTS_COPY.variant.stockRange)
      .max(INITIAL_STOCK_MAX, PRODUCTS_COPY.variant.stockRange),
  );

const variantStatus = z.enum(VARIANT_STATUSES);

/** `COMPARE_AT_PRICE_INVALID` checked before sending: compare-at must be greater than the price. */
function compareAtRule(values: { price: string; compareAtPrice: string | null }, ctx: z.RefinementCtx) {
  if (values.compareAtPrice === null) return;
  if (parseMoney(values.compareAtPrice).lessThanOrEqualTo(parseMoney(values.price))) {
    ctx.addIssue({
      code: 'custom',
      path: ['compareAtPrice'],
      message: PRODUCTS_COPY.variant.compareAtInvalid,
    });
  }
}

/**
 * Create: one select per effective attribute, each required (exactly one option per attribute
 * [SPEC 06 UC-CA-4]); `taken` holds the option signatures of the product's variants, so an existing
 * combination can't be submitted (`VARIANT_COMBINATION_EXISTS`).
 */
export function createVariantSchema(attributes: readonly EffectiveAttribute[], taken: ReadonlySet<string>) {
  return z
    .object({
      options: z.object(
        Object.fromEntries(
          attributes.map((attribute) => [
            attribute.id,
            z.string().min(1, PRODUCTS_COPY.variant.chooseOption),
          ]),
        ),
      ),
      sku,
      price: fields.positiveMoney,
      compareAtPrice,
      initialStock,
      status: variantStatus,
    })
    .superRefine((values, ctx) => {
      compareAtRule(values, ctx);
      const optionIds = attributes.map((attribute) => values.options[attribute.id] ?? '');
      if (attributes.length > 0 && taken.has(optionSignature(optionIds))) {
        ctx.addIssue({ code: 'custom', path: ['options'], message: PRODUCTS_COPY.variant.combinationExists });
      }
    });
}
export type CreateVariantSchema = ReturnType<typeof createVariantSchema>;
export type CreateVariantValues = z.input<CreateVariantSchema>;

export function emptyVariantValues(attributes: readonly EffectiveAttribute[]): CreateVariantValues {
  return {
    options: Object.fromEntries(attributes.map((attribute) => [attribute.id, ''])),
    sku: '',
    price: '',
    compareAtPrice: '',
    initialStock: '0',
    // SE-Q-7: new variants are Active by default.
    status: 'active',
  };
}

/** `optionIds` in attribute order (spec 02 SE-11); empty compare-at omitted on create (conventions §5). */
export function toCreateVariantBody(
  values: z.output<CreateVariantSchema>,
  attributes: readonly EffectiveAttribute[],
): Schema<'CreateVariantDto'> {
  return {
    sku: values.sku,
    price: values.price,
    ...(values.compareAtPrice === null ? {} : { compareAtPrice: values.compareAtPrice }),
    optionIds: attributes.map((attribute) => values.options[attribute.id] ?? ''),
    initialStock: values.initialStock,
    status: values.status,
  };
}

export const editVariantSchema = z
  .object({ sku, price: fields.positiveMoney, compareAtPrice, status: variantStatus })
  .superRefine(compareAtRule);
export type EditVariantValues = z.input<typeof editVariantSchema>;
type EditVariantOutput = z.output<typeof editVariantSchema>;

export function editVariantValues(variant: SellerVariant): EditVariantValues {
  return {
    sku: variant.sku,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice ?? '',
    status: variant.status,
  };
}

/** Money compared as amounts (`150` equals `150.00`), so an untouched price is never sent. */
const sameMoney = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : parseMoney(a).equals(parseMoney(b));

/** Only changed fields; a cleared compare-at as `null`. Null when nothing changed. */
export function variantPatch(
  values: EditVariantOutput,
  variant: SellerVariant,
): Schema<'UpdateVariantDto'> | null {
  const patch: Schema<'UpdateVariantDto'> = {
    ...(values.sku === variant.sku ? {} : { sku: values.sku }),
    ...(sameMoney(values.price, variant.price) ? {} : { price: values.price }),
    ...(sameMoney(values.compareAtPrice, variant.compareAtPrice)
      ? {}
      : { compareAtPrice: values.compareAtPrice }),
    ...(values.status === variant.status ? {} : { status: values.status }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}

export function variantHasChanges(values: EditVariantValues, variant: SellerVariant): boolean {
  const parsed = editVariantSchema.safeParse(values);
  return !parsed.success || variantPatch(parsed.data, variant) !== null;
}

/** Order-independent key of an option set, like the backend's `option_signature` (sorted ids). */
export function optionSignature(optionIds: readonly string[]): string {
  return [...optionIds].sort().join(',');
}

/** `VALIDATION_FAILED` details of the product forms. */
export const PRODUCT_FIELD_MAP = {
  categoryId: { field: 'categoryId', message: fields.FIELD_MESSAGES.required },
  name: { field: 'name', message: fields.FIELD_MESSAGES.tooLong(PRODUCT_NAME_MAX) },
  description: { field: 'description', message: fields.FIELD_MESSAGES.tooLong(PRODUCT_DESCRIPTION_MAX) },
} as const;
