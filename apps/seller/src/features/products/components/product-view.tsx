'use client';

import { isApiError } from '@nile/api';
import { PRODUCT_STATUS_LABELS } from '@nile/domain';
import { categoryAttributesQuery } from '@nile/query';
import {
  Badge,
  buttonVariants,
  ErrorState,
  NotFoundScreen,
  PageHeader,
  PRODUCT_STATUS_TONES,
  Skeleton,
  StatusBadge,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { browserApi } from '@/lib/browser-api';
import { publicEnv } from '@/lib/env/public';
import { ROUTES, STOREFRONT_PRODUCT_PATH } from '@/lib/routes';
import { isProductMissing, productQuery, type SellerProduct } from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';
import { ProductActions } from './product-actions';
import { ProductDetailsForm } from './product-details-form';
import { VariantsSection } from './variants-section';

/** SE-10 Product: `GET /seller/products/{id}`, its status actions, details form and variants. */
export function ProductView({ productId }: { readonly productId: string }) {
  const product = useQuery(productQuery(productId));

  if (product.isError) {
    if (isProductMissing(product.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.products} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToProducts}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void product.refetch()}
          correlationId={isApiError(product.error) ? (product.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (product.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 max-w-2xl" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  return <ProductContent product={product.data} />;
}

function ProductContent({ product }: { readonly product: SellerProduct }) {
  // The variant form needs the category's attributes; a deactivated category answers CATEGORY_NOT_FOUND
  // (SE-Q-2: details stay editable, variants can't be added).
  const attributes = useQuery(categoryAttributesQuery(browserApi, product.categoryId));
  const categoryUnavailable = isApiError(attributes.error, 'CATEGORY_NOT_FOUND');

  return (
    <div className="space-y-8">
      <PageHeader
        title={product.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={product.status} labels={PRODUCT_STATUS_LABELS} tones={PRODUCT_STATUS_TONES} />
            <Badge tone={product.visible ? 'success' : 'neutral'}>
              {product.visible ? COPY.visible : COPY.hidden}
            </Badge>
            {product.visible ? (
              <a
                href={`${publicEnv.NEXT_PUBLIC_STOREFRONT_URL}${STOREFRONT_PRODUCT_PATH(product.slug)}`}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {COPY.viewInStore}
              </a>
            ) : null}
          </span>
        }
      />
      <ProductActions product={product} />
      {/* A newer answer from the API (another save, a variant change) resets the form to it. */}
      <ProductDetailsForm key={product.updatedAt} product={product} />
      <VariantsSection
        product={product}
        attributes={attributes.data ?? null}
        categoryUnavailable={categoryUnavailable}
      />
      {attributes.isError && !categoryUnavailable ? (
        <ErrorState message={COPY.loadFailed} onRetry={() => void attributes.refetch()} />
      ) : null}
    </div>
  );
}
