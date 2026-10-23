'use client';

import { isApiError } from '@nile/api';
import { buttonVariants, ErrorState, NotFoundScreen, PageHeader, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { StockHistory, STOCK_COPY } from '@/features/stock';
import { productPath, ROUTES } from '@/lib/routes';
import { isProductMissing, productQuery } from '../api';
import { PRODUCTS_COPY } from '../copy';

/** SE-13 page: the product names the variant (SKU) and leads back; the movements come from the stock feature. */
export function VariantStockHistory({
  productId,
  variantId,
}: {
  readonly productId: string;
  readonly variantId: string;
}) {
  const product = useQuery(productQuery(productId));

  if (product.isError && !isProductMissing(product.error)) {
    return (
      <div className="space-y-6">
        <PageHeader title={STOCK_COPY.history} />
        <ErrorState
          message={PRODUCTS_COPY.loadFailed}
          onRetry={() => void product.refetch()}
          correlationId={isApiError(product.error) ? (product.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (product.data === undefined && !product.isError) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const variant = product.data?.variants.find((item) => item.id === variantId);
  if (product.data === undefined || variant === undefined) {
    // Another seller's, deleted, or a mistyped link: "not found" (ownership failures are 404, CLAUDE.md §3).
    return (
      <NotFoundScreen
        message={STOCK_COPY.variantGone}
        homeLink={
          <Link href={ROUTES.products} className={buttonVariants({ variant: 'outline' })}>
            {PRODUCTS_COPY.backToProducts}
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader
        title={STOCK_COPY.historyTitle(variant.sku)}
        description={product.data.name}
        actions={
          <Link href={productPath(productId)} className={buttonVariants({ variant: 'outline' })}>
            {STOCK_COPY.backToProduct}
          </Link>
        }
      />
      <StockHistory variantId={variantId} />
    </div>
  );
}
