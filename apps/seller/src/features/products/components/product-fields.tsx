'use client';

import { categoryAttributesQuery } from '@nile/query';
import { Button, Field, FormAlert, Input, Select, Textarea, UI_COPY } from '@nile/ui';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useWatch, type UseFormReturn } from 'react-hook-form';
import type * as z from 'zod';
import { browserApi } from '@/lib/browser-api';
import type { CategoryNode } from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';
import type { CategoryChoice } from '../lib/categories';
import { PRODUCT_DESCRIPTION_MAX, type productSchema, type ProductValues } from '../schemas';

export type ProductForm = UseFormReturn<ProductValues, unknown, z.output<typeof productSchema>>;

export interface ProductFieldsProps {
  readonly form: ProductForm;
  readonly categories: UseQueryResult<readonly CategoryNode[]>;
  readonly choices: readonly CategoryChoice[];
  /** Why the category can't change (the product has variants); null when it can. */
  readonly categoryLockedReason: string | null;
}

/** Category (with the options its variants will need), name and description: SE-09 and SE-10-A1. */
export function ProductFields({ form, categories, choices, categoryLockedReason }: ProductFieldsProps) {
  const [categoryId, description] = useWatch({ control: form.control, name: ['categoryId', 'description'] });
  return (
    <>
      {categories.isError ? (
        <FormAlert>
          {COPY.categoriesFailed}{' '}
          <Button variant="link" className="h-auto px-0" onClick={() => void categories.refetch()}>
            {UI_COPY.tryAgain}
          </Button>
        </FormAlert>
      ) : null}
      <Field
        control={form.control}
        name="categoryId"
        label={COPY.category}
        required
        description={categoryLockedReason ?? COPY.categoryLockNote}
        render={({ field, controlProps }) => (
          <Select
            {...controlProps}
            options={choices.map((choice) => ({ value: choice.id, label: choice.path }))}
            placeholder={COPY.categoryPlaceholder}
            value={field.value}
            onValueChange={field.onChange}
            onBlur={field.onBlur}
            disabled={categories.isPending || categoryLockedReason !== null}
          />
        )}
      />
      {categoryId === '' ? null : <CategoryOptionsHint categoryId={categoryId} />}
      <Field
        control={form.control}
        name="name"
        label={COPY.name}
        required
        render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
      />
      <Field
        control={form.control}
        name="description"
        label={COPY.description}
        required
        description={COPY.characters(description.length, PRODUCT_DESCRIPTION_MAX)}
        render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={6} />}
      />
    </>
  );
}

/** "Variants will need: Size, Color" from the effective attributes (spec 02 SE-09). */
function CategoryOptionsHint({ categoryId }: { readonly categoryId: string }) {
  const attributes = useQuery(categoryAttributesQuery(browserApi, categoryId));
  if (attributes.data === undefined) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {attributes.data.length === 0
        ? COPY.noOptions
        : COPY.needsOptions(attributes.data.map((attribute) => attribute.name))}
    </p>
  );
}
