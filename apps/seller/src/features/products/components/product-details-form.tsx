'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import { applyServerErrors, categoriesTreeQuery } from '@nile/query';
import { Button, FormAlert, toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { browserApi } from '@/lib/browser-api';
import { productKeys, updateProduct, type SellerProduct } from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';
import { categoryChoices } from '../lib/categories';
import {
  PRODUCT_FIELD_MAP,
  productHasChanges,
  productPatch,
  productSchema,
  productValues,
  type ProductValues,
} from '../schemas';
import { ProductFields } from './product-fields';

/**
 * SE-10-A1 Save details: only changed fields; the category only while the product has no variants
 * [SPEC 06 `PRODUCT_CATEGORY_LOCKED`]. The parent keys this form by `updatedAt`, so a newer product from the
 * API resets it.
 */
export function ProductDetailsForm({ product }: { readonly product: SellerProduct }) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const access = useSellerAccess();
  const handleNotApproved = useNotApprovedHandler();
  const reasonId = useId();
  const categories = useQuery(categoriesTreeQuery(browserApi));
  const choices = useMemo(() => {
    const active = categoryChoices(categories.data ?? []);
    // A deactivated category (SE-Q-2) stays selectable as the current value, so the form still validates.
    return categories.data === undefined || active.some((choice) => choice.id === product.categoryId)
      ? active
      : [{ id: product.categoryId, path: COPY.unavailableCategory }, ...active];
  }, [categories.data, product.categoryId]);
  const form = useForm<ProductValues, unknown, z.output<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    mode: 'onBlur',
    defaultValues: productValues(product),
  });
  const changed = productHasChanges(useWatch({ control: form.control }) as ProductValues, product);

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    const patch = productPatch(values, product);
    if (patch === null) return;
    try {
      const updated = await updateProduct(product.id, patch);
      queryClient.setQueryData(productKeys.detail(product.id), updated);
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      toast({ title: COPY.saved });
    } catch (error) {
      if (handleNotApproved(error)) return;
      if (isApiError(error, 'PRODUCT_CATEGORY_LOCKED')) {
        void queryClient.invalidateQueries({ queryKey: productKeys.detail(product.id) });
        form.setError('categoryId', { type: 'server', message: COPY.errors.PRODUCT_CATEGORY_LOCKED });
        return;
      }
      if (isApiError(error, 'CATEGORY_NOT_FOUND')) {
        void categories.refetch();
        form.setError('categoryId', { type: 'server', message: COPY.errors.CATEGORY_NOT_FOUND });
        return;
      }
      if (!applyServerErrors(error, form.setError, PRODUCT_FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <section aria-labelledby="details-heading" className="max-w-2xl space-y-4">
      <h2 id="details-heading" className="text-lg font-semibold">
        {COPY.detailsHeading}
      </h2>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <ProductFields
          form={form}
          categories={categories}
          choices={choices}
          categoryLockedReason={product.variants.length > 0 ? COPY.categoryLocked : null}
        />
        <Button
          type="submit"
          loading={form.formState.isSubmitting}
          disabled={!hydrated || !access.catalog || !changed || failure.blocked}
          aria-describedby={access.reason === null ? undefined : reasonId}
        >
          {COPY.save}
        </Button>
        {access.reason === null ? null : (
          <p id={reasonId} className="text-sm text-muted-foreground">
            {access.reason}
          </p>
        )}
      </form>
    </section>
  );
}
