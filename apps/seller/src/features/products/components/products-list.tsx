'use client';

import { isApiError } from '@nile/api';
import { formatDate, PRODUCT_STATUS_LABELS } from '@nile/domain';
import { categoriesTreeQuery } from '@nile/query';
import {
  Badge,
  buttonVariants,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Money,
  PageHeader,
  PRODUCT_STATUS_TONES,
  Select,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSellerAccess } from '@/features/profile';
import { browserApi } from '@/lib/browser-api';
import { productPath, ROUTES } from '@/lib/routes';
import { productsListOptions, type SellerProductListItem } from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';
import { categoryChoices, categoryPath, type CategoryChoice } from '../lib/categories';
import {
  hasFilters,
  NAME_FILTER_MAX,
  parseProductFilters,
  productFiltersQuery,
  type ProductFilters,
  type RawProductParams,
} from '../lib/list-params';

/** Spec 02 SE-08 [PROPOSED]: the name search waits for a pause in typing. */
export const NAME_SEARCH_DEBOUNCE_MS = 400;
const ALL_CATEGORIES = 'all';

const STATUS_TABS = [
  { status: null, label: COPY.tabs.all },
  { status: 'draft', label: COPY.tabs.draft },
  { status: 'active', label: COPY.tabs.active },
  { status: 'inactive', label: COPY.tabs.inactive },
] as const;

const listHref = (filters: ProductFilters): Route => {
  const query = productFiltersQuery(filters);
  return query === '' ? ROUTES.products : `${ROUTES.products}?${query}`;
};

/** SE-08 Products: filters live in the URL (`?status=&category=&name=`), newest first, "Load more". */
export function ProductsList({ params }: { readonly params: RawProductParams }) {
  const filters = parseProductFilters(params);
  const router = useRouter();
  const access = useSellerAccess();
  const products = useInfiniteQuery(productsListOptions(filters));
  const categories = useQuery(categoriesTreeQuery(browserApi));
  const choices = useMemo(() => categoryChoices(categories.data ?? []), [categories.data]);
  const rows = products.data?.pages.flatMap((page) => page.data) ?? [];
  const navigate = (next: ProductFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };

  const addProduct = access.catalog ? (
    <Link href={ROUTES.newProduct} className={buttonVariants()}>
      {COPY.addProduct}
    </Link>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} actions={addProduct ?? undefined} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => {
            const current = tab.status === filters.status;
            return (
              <li key={tab.label}>
                <Link
                  href={listHref({ ...filters, status: tab.status })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {products.isError ? (
        <ErrorState
          message={COPY.listLoadFailed}
          onRetry={() => void products.refetch()}
          correlationId={isApiError(products.error) ? (products.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns(choices, categories.isSuccess)}
          rows={rows}
          getRowId={(row) => row.id}
          loading={products.isPending}
          hasMore={products.hasNextPage}
          loadingMore={products.isFetchingNextPage}
          onLoadMore={() => void products.fetchNextPage()}
          toolbar={
            <Filters
              filters={filters}
              choices={choices}
              categoriesPending={categories.isPending}
              onChange={navigate}
            />
          }
          empty={
            hasFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link href={ROUTES.products} className={buttonVariants({ variant: 'outline' })}>
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState
                title={COPY.empty}
                {...(access.reason === null ? {} : { description: access.reason })}
                action={addProduct}
              />
            )
          }
        />
      )}
      <p className="text-sm text-muted-foreground">{COPY.visibleHelp}</p>
    </div>
  );
}

function columns(
  choices: readonly CategoryChoice[],
  categoriesLoaded: boolean,
): readonly DataTableColumn<SellerProductListItem>[] {
  return [
    {
      id: 'name',
      header: COPY.columns.name,
      cell: (row) => (
        <Link
          href={productPath(row.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {row.name}
        </Link>
      ),
    },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (row) => (
        <StatusBadge value={row.status} labels={PRODUCT_STATUS_LABELS} tones={PRODUCT_STATUS_TONES} />
      ),
    },
    {
      id: 'store',
      header: COPY.columns.store,
      cell: (row) => (
        <span className="flex flex-wrap gap-1">
          <Badge tone={row.visible ? 'success' : 'neutral'}>{row.visible ? COPY.visible : COPY.hidden}</Badge>
          {/* Out of stock only means something once the product has variants (it has a price then). */}
          {!row.inStock && row.minPrice !== null ? <Badge tone="warning">{COPY.outOfStock}</Badge> : null}
        </span>
      ),
    },
    {
      id: 'category',
      header: COPY.columns.category,
      cell: (row) =>
        categoriesLoaded ? (categoryPath(choices, row.categoryId) ?? COPY.unavailableCategory) : null,
    },
    {
      id: 'price',
      header: COPY.columns.price,
      align: 'end',
      cell: (row) =>
        row.minPrice === null || row.maxPrice === null ? (
          COPY.noPrice
        ) : (
          <Money value={row.minPrice} max={row.maxPrice} />
        ),
    },
    { id: 'created', header: COPY.columns.created, cell: (row) => formatDate(row.createdAt) },
  ];
}

interface FiltersProps {
  readonly filters: ProductFilters;
  readonly choices: readonly CategoryChoice[];
  readonly categoriesPending: boolean;
  readonly onChange: (next: ProductFilters, replace?: boolean) => void;
}

function Filters({ filters, choices, categoriesPending, onChange }: FiltersProps) {
  const categoryId = useId();
  const nameId = useId();
  const [name, setName] = useState(filters.name ?? '');

  // The URL changed from elsewhere (Back, a tab, "Clear filters"): show its value. Adjusted while
  // rendering, not in an effect; text that only differs by surrounding spaces is the user's, kept as typed.
  const [urlName, setUrlName] = useState(filters.name);
  if (urlName !== filters.name) {
    setUrlName(filters.name);
    if (name.trim() !== (filters.name ?? '')) setName(filters.name ?? '');
  }

  // The latest filters and callback, read when the timer fires: re-renders of the list must not restart it.
  const latest = useRef({ filters, onChange });
  useEffect(() => {
    latest.current = { filters, onChange };
  });

  // Typing replaces the history entry once the user pauses, so Back skips the keystrokes.
  useEffect(() => {
    const trimmed = name.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === filters.name) return undefined;
    const timer = setTimeout(() => {
      latest.current.onChange({ ...latest.current.filters, name: next }, true);
    }, NAME_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [name, filters.name]);

  return (
    <div className="mb-4 flex flex-wrap items-end gap-4">
      <div className="w-full space-y-1 sm:w-72">
        <Label htmlFor={categoryId}>{COPY.categoryFilter}</Label>
        <Select
          id={categoryId}
          options={[
            { value: ALL_CATEGORIES, label: COPY.allCategories },
            ...choices.map((choice) => ({ value: choice.id, label: choice.path })),
          ]}
          value={filters.categoryId ?? ALL_CATEGORIES}
          onValueChange={(value) => {
            onChange({ ...filters, categoryId: value === ALL_CATEGORIES ? null : value });
          }}
          disabled={categoriesPending}
        />
      </div>
      <div className="w-full space-y-1 sm:w-72">
        <Label htmlFor={nameId}>{COPY.nameFilter}</Label>
        <Input
          id={nameId}
          type="search"
          value={name}
          maxLength={NAME_FILTER_MAX}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
    </div>
  );
}
