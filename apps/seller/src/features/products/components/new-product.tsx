'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import { applyServerErrors, categoriesTreeQuery } from '@nile/query';
import { Button, ErrorState, FormAlert, PageHeader, Skeleton, toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import type * as z from 'zod';
import { profileQuery, useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { browserApi } from '@/lib/browser-api';
import { productPath, ROUTES } from '@/lib/routes';
import { createProduct, productKeys } from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';
import { categoryChoices } from '../lib/categories';
import {
  EMPTY_PRODUCT,
  PRODUCT_FIELD_MAP,
  productSchema,
  toCreateProductBody,
  type ProductValues,
} from '../schemas';
import { ProductFields } from './product-fields';

/**
 * SE-09 New product: approved sellers only (others go back to `/products`, where the banner explains). Creates
 * a draft and opens it, so the seller can add the first variant.
 */
export function NewProduct() {
  const router = useRouter();
  const profile = useQuery(profileQuery());
  const access = useSellerAccess();
  const refusedByStatus = access.reason !== null;

  useEffect(() => {
    if (refusedByStatus) router.replace(ROUTES.products);
  }, [refusedByStatus, router]);

  if (profile.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.newTitle} />
        <ErrorState
          message={COPY.profileFailed}
          onRetry={() => void profile.refetch()}
          correlationId={isApiError(profile.error) ? (profile.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (!access.catalog) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={COPY.newTitle} />
        <Skeleton className="h-96 max-w-2xl" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.newTitle} />
      <NewProductForm />
    </div>
  );
}

function NewProductForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const hydrated = useHydrated();
  const handleNotApproved = useNotApprovedHandler();
  const categories = useQuery(categoriesTreeQuery(browserApi));
  const choices = useMemo(() => categoryChoices(categories.data ?? []), [categories.data]);
  const form = useForm<ProductValues, unknown, z.output<typeof productSchema>>({
    resolver: zodResolver(productSchema),
    mode: 'onBlur',
    defaultValues: EMPTY_PRODUCT,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    try {
      const product = await createProduct(toCreateProductBody(values));
      queryClient.setQueryData(productKeys.detail(product.id), product);
      void queryClient.invalidateQueries({ queryKey: productKeys.lists() });
      toast({ title: COPY.created, tone: 'success' });
      router.push(productPath(product.id));
    } catch (error) {
      if (handleNotApproved(error)) return;
      if (isApiError(error, 'CATEGORY_NOT_FOUND')) {
        void categories.refetch();
        form.setError('categoryId', { type: 'server', message: COPY.errors.CATEGORY_NOT_FOUND });
        return;
      }
      if (!applyServerErrors(error, form.setError, PRODUCT_FIELD_MAP)) failure.fail(error);
    }
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="max-w-2xl space-y-4">
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <ProductFields form={form} categories={categories} choices={choices} categoryLockedReason={null} />
      <Button type="submit" loading={form.formState.isSubmitting} disabled={!hydrated || failure.blocked}>
        {COPY.create}
      </Button>
    </form>
  );
}
