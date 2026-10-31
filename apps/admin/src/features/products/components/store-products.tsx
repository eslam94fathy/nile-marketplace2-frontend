'use client';

import { isApiError } from '@nile/api';
import { formatDate, formatMoneyRange } from '@nile/domain';
import { DataTable, ErrorState, NileImage, type DataTableColumn } from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { productPath } from '@/lib/routes';
import { storeProductsOptions, type StoreProduct } from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';

/**
 * AD-05 "Products in the store" (spec 03 §7.3, AD-Q-11): what customers see of this seller, newest first, each
 * opening AD-27. Unpublished and blocked products aren't listed (the listing is the public one).
 */
export function StoreProducts({ sellerId }: { readonly sellerId: string }) {
  const products = useInfiniteQuery(storeProductsOptions(sellerId));

  const columns: readonly DataTableColumn<StoreProduct>[] = [
    {
      id: 'name',
      header: COPY.storeColumns.name,
      cell: (product) => (
        <span className="flex items-center gap-3">
          <NileImage
            image={product.primaryImage}
            // Decorative: the product name follows as the link text.
            alt=""
            sizes="40px"
            placeholder="product"
            className="size-10 shrink-0 rounded bg-muted object-cover"
          />
          <Link
            href={productPath(product.id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {product.name}
          </Link>
        </span>
      ),
    },
    {
      id: 'price',
      header: COPY.storeColumns.price,
      align: 'end',
      cell: (product) => formatMoneyRange(product.minPrice, product.maxPrice),
    },
    {
      id: 'stock',
      header: COPY.storeColumns.stock,
      cell: (product) => (product.inStock ? COPY.inStock : COPY.outOfStock),
    },
    {
      id: 'published',
      header: COPY.storeColumns.published,
      cell: (product) => formatDate(product.publishedAt),
    },
  ];

  return (
    <section aria-labelledby="store-products-heading" className="space-y-3">
      <h2 id="store-products-heading" className="text-lg font-semibold">
        {COPY.storeHeading}
      </h2>
      {products.isError ? (
        <ErrorState
          message={COPY.storeFailed}
          onRetry={() => void products.refetch()}
          correlationId={isApiError(products.error) ? (products.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.storeCaption}
          columns={columns}
          rows={products.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(product) => product.id}
          loading={products.isPending}
          empty={<p className="text-sm text-muted-foreground">{COPY.storeEmpty}</p>}
          hasMore={products.hasNextPage}
          loadingMore={products.isFetchingNextPage}
          onLoadMore={() => void products.fetchNextPage()}
        />
      )}
    </section>
  );
}
