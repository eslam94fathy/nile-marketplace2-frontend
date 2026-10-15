'use client';

import { isApiError, type ProductQueryInput } from '@nile/api';
import { defaultErrorMessage } from '@nile/domain';
import { Button, EmptyState, ErrorState, LoadMore, Skeleton, toast } from '@nile/ui';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useEffectEvent } from 'react';
import { browserApi } from '@/lib/browser-api';
import { productListOptions } from '../api';
import { CATALOG_COPY } from '../copy';
import { ProductGrid } from './product-card';

const SKELETON_CARDS = 6;

export interface ProductResultsProps {
  readonly query: ProductQueryInput;
  /** A filter change is on its way: dim the current results (spec 01 SF-04 loading state). */
  readonly updating: boolean;
  readonly filtersSet: boolean;
  readonly onClearFilters: () => void;
  /** INVALID_QUERY / INVALID_CURSOR: go back to the default listing (conventions §4). */
  readonly onReset: () => void;
}

/** The listing itself: first page hydrated from the server, "Load more" by cursor, every state. */
export function ProductResults({
  query,
  updating,
  filtersSet,
  onClearFilters,
  onReset,
}: ProductResultsProps) {
  const products = useInfiniteQuery({
    ...productListOptions(browserApi, query),
    placeholderData: keepPreviousData,
  });
  const invalid = isApiError(products.error, 'INVALID_QUERY', 'INVALID_CURSOR');
  const reset = useEffectEvent(() => {
    toast({ title: defaultErrorMessage('INVALID_QUERY') });
    onReset();
  });

  useEffect(() => {
    if (invalid) reset();
  }, [invalid]);

  if (products.isPending) {
    return (
      <ul aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: SKELETON_CARDS }, (_, index) => (
          <li key={index}>
            <Skeleton className="h-40" />
          </li>
        ))}
      </ul>
    );
  }
  if (products.isError && !invalid) {
    return (
      <ErrorState
        message={CATALOG_COPY.productsFailed}
        onRetry={() => void products.refetch()}
        retrying={products.isFetching}
        correlationId={isApiError(products.error) ? (products.error.correlationId ?? undefined) : undefined}
      />
    );
  }

  const items = products.data?.pages.flatMap((page) => page.data) ?? [];
  const busy = updating || products.isPlaceholderData;
  if (items.length === 0) {
    return (
      <EmptyState
        title={CATALOG_COPY.noResults}
        action={
          filtersSet ? (
            <Button variant="outline" onClick={onClearFilters}>
              {CATALOG_COPY.clearFilters}
            </Button>
          ) : undefined
        }
      />
    );
  }
  return (
    <div className="space-y-6">
      {busy ? (
        <div role="status" className="h-1 w-full overflow-hidden rounded bg-muted">
          <span className="sr-only">{CATALOG_COPY.updating}</span>
          <div className="h-full w-1/3 animate-pulse bg-primary" />
        </div>
      ) : null}
      <div aria-busy={busy} className={busy ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
        <ProductGrid products={items} />
      </div>
      <LoadMore
        hasMore={products.hasNextPage}
        loading={products.isFetchingNextPage}
        loadedCount={items.length}
        onLoadMore={() => void products.fetchNextPage()}
      />
    </div>
  );
}
