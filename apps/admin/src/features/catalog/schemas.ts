import type { Schema } from '@nile/api';
import { fields } from '@nile/domain';
import * as z from 'zod';
import type { CategoryNode } from './api';
import { SORT_ORDER_MAX } from './lib/tree';

// AD-07 forms, mirroring `CreateCategoryDto`, `UpdateCategoryDto`, `CreateAttributeDto`, `CreateOptionDto` and
// their updates [SPEC 06 §4.2]. Slugs and codes use the backend's slug rule (not trimmed there either).

const sortOrder = z
  .string()
  .trim()
  .regex(/^\d+$/, `Enter a whole number from 0 to ${SORT_ORDER_MAX}.`)
  .transform(Number)
  .pipe(z.number().int().max(SORT_ORDER_MAX, `Enter a whole number from 0 to ${SORT_ORDER_MAX}.`));

/** Optional slug: empty lets the backend derive it from the name (create) or keeps the current one (edit). */
const optionalSlug = z
  .string()
  .transform((value) => (value === '' ? null : value))
  .pipe(fields.slug(1, 120).nullable());

export const categorySchema = z.object({
  name: fields.trimmedString(1, 100),
  slug: optionalSlug,
  sortOrder,
});
export type CategoryValues = z.input<typeof categorySchema>;
type CategoryOutput = z.output<typeof categorySchema>;

export function toCreateCategoryBody(
  values: CategoryOutput,
  parentId: string | null,
): Schema<'CreateCategoryDto'> {
  return {
    ...(parentId === null ? {} : { parentId }),
    name: values.name,
    ...(values.slug === null ? {} : { slug: values.slug }),
    sortOrder: values.sortOrder,
  };
}

export const categoryValues = (node: CategoryNode): CategoryValues => ({
  name: node.name,
  slug: node.slug,
  sortOrder: String(node.sortOrder),
});

/** Changed fields only; an emptied slug keeps the current one (the API can't clear it). Null when nothing changed. */
export function categoryPatch(
  values: CategoryOutput,
  node: CategoryNode,
): Schema<'UpdateCategoryDto'> | null {
  const patch: Schema<'UpdateCategoryDto'> = {
    ...(values.name === node.name ? {} : { name: values.name }),
    ...(values.slug === null || values.slug === node.slug ? {} : { slug: values.slug }),
    ...(values.sortOrder === node.sortOrder ? {} : { sortOrder: values.sortOrder }),
  };
  return Object.keys(patch).length === 0 ? null : patch;
}

export const attributeSchema = z.object({
  name: fields.trimmedString(1, 60),
  code: fields.slug(1, 60),
  sortOrder,
});
export type AttributeValues = z.input<typeof attributeSchema>;

export const optionSchema = z.object({
  value: fields.trimmedString(1, 60),
  code: fields.slug(1, 60),
  sortOrder,
});
export type OptionValues = z.input<typeof optionSchema>;

/** Editing an attribute or option: the code is fixed, so only the label and order. */
export const labelEditSchema = z.object({ label: fields.trimmedString(1, 60), sortOrder });
export type LabelEditValues = z.input<typeof labelEditSchema>;
