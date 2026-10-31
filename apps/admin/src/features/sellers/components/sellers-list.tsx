'use client';

import { isApiError } from '@nile/api';
import { formatDate, formatRatePercent, SELLER_STATUS_LABELS } from '@nile/domain';
import {
  buttonVariants,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  RatingStars,
  Select,
  SELLER_STATUS_TONES,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useGovernorateName } from '@/features/lookups';
import { ROUTES, sellerPath } from '@/lib/routes';
import { sellersListOptions, type AdminSeller } from '../api';
import { SELLERS_COPY as COPY } from '../copy';
import {
  hasNarrowingFilters,
  NAME_FILTER_MAX,
  parseSellerFilters,
  sellerFiltersQuery,
  type RawSellerParams,
  type SellerFilters,
} from '../lib/list-params';

/** As the seller portal's product search (spec 02 SE-08): the name filter waits for a pause in typing. */
export const NAME_SEARCH_DEBOUNCE_MS = 400;
const ALL = 'all';

const TABS = [
  { status: 'pending_approval', label: COPY.tabs.pending_approval },
  { status: 'approved', label: COPY.tabs.approved },
  { status: 'rejected', label: COPY.tabs.rejected },
  { status: 'suspended', label: COPY.tabs.suspended },
  { status: null, label: COPY.tabs.all },
] as const;

const listHref = (filters: SellerFilters): Route => {
  const query = sellerFiltersQuery(filters);
  return query === '' ? ROUTES.sellers : `${ROUTES.sellers}?${query}`;
};

const dateOrDash = (iso: string | null) => (iso === null ? COPY.never : formatDate(iso));

/** AD-04 Sellers: status tabs, name search, pickup governorate and created dates, all in the URL. */
export function SellersList({ params }: { readonly params: RawSellerParams }) {
  const filters = parseSellerFilters(params);
  const router = useRouter();
  const sellers = useInfiniteQuery(sellersListOptions(filters));
  const governorates = useGovernorateName();
  const navigate = (next: SellerFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };

  const columns: readonly DataTableColumn<AdminSeller>[] = [
    {
      id: 'business',
      header: COPY.columns.business,
      cell: (seller) => (
        <Link
          href={sellerPath(seller.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {seller.businessName}
        </Link>
      ),
    },
    { id: 'email', header: COPY.columns.email, cell: (seller) => seller.email },
    { id: 'phone', header: COPY.columns.phone, cell: (seller) => seller.contactPhone },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (seller) => (
        <StatusBadge value={seller.status} labels={SELLER_STATUS_LABELS} tones={SELLER_STATUS_TONES} />
      ),
    },
    {
      id: 'rating',
      header: COPY.columns.rating,
      cell: (seller) => <RatingStars avg={seller.ratingAvg} count={seller.ratingCount} />,
    },
    {
      id: 'commission',
      header: COPY.columns.commission,
      align: 'end',
      cell: (seller) => formatRatePercent(seller.commissionRate),
    },
    {
      id: 'governorate',
      header: COPY.columns.governorate,
      cell: (seller) => governorates.name(seller.pickupGovernorateId),
    },
    { id: 'created', header: COPY.columns.created, cell: (seller) => formatDate(seller.createdAt) },
    { id: 'approved', header: COPY.columns.approved, cell: (seller) => dateOrDash(seller.approvedAt) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
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
      {sellers.isError ? (
        <ErrorState
          message={COPY.listFailed}
          onRetry={() => void sellers.refetch()}
          correlationId={isApiError(sellers.error) ? (sellers.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={sellers.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(seller) => seller.id}
          loading={sellers.isPending}
          hasMore={sellers.hasNextPage}
          loadingMore={sellers.isFetchingNextPage}
          onLoadMore={() => void sellers.fetchNextPage()}
          toolbar={
            <Filters
              filters={filters}
              governorates={governorates.governorates}
              governoratesLoading={governorates.loading}
              onChange={navigate}
            />
          }
          empty={
            hasNarrowingFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link
                    href={listHref({ ...filters, name: null, governorateId: null, from: null, to: null })}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState title={COPY.empty} />
            )
          }
        />
      )}
    </div>
  );
}

interface FiltersProps {
  readonly filters: SellerFilters;
  readonly governorates: readonly { readonly id: string; readonly name: string }[];
  readonly governoratesLoading: boolean;
  readonly onChange: (next: SellerFilters, replace?: boolean) => void;
}

function Filters({ filters, governorates, governoratesLoading, onChange }: FiltersProps) {
  const nameId = useId();
  const governorateId = useId();
  const fromId = useId();
  const toId = useId();
  const [name, setName] = useState(filters.name ?? '');

  // The URL changed from elsewhere (Back, a tab, "Clear filters"): show its value (adjusted while rendering).
  const [urlName, setUrlName] = useState(filters.name);
  if (urlName !== filters.name) {
    setUrlName(filters.name);
    if (name.trim() !== (filters.name ?? '')) setName(filters.name ?? '');
  }

  // The latest filters and callback, read when the timer fires: re-renders must not restart it.
  const latest = useRef({ filters, onChange });
  useEffect(() => {
    latest.current = { filters, onChange };
  });

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
    <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-1">
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
      <div className="space-y-1">
        <Label htmlFor={governorateId}>{COPY.governorateFilter}</Label>
        <Select
          id={governorateId}
          options={[
            { value: ALL, label: COPY.allGovernorates },
            ...governorates.map((governorate) => ({ value: governorate.id, label: governorate.name })),
          ]}
          value={filters.governorateId ?? ALL}
          onValueChange={(value) => {
            onChange({ ...filters, governorateId: value === ALL ? null : value });
          }}
          disabled={governoratesLoading}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={fromId}>{COPY.from}</Label>
        <Input
          id={fromId}
          type="date"
          value={filters.from ?? ''}
          max={filters.to ?? undefined}
          onChange={(event) => {
            onChange({ ...filters, from: event.target.value === '' ? null : event.target.value }, true);
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={toId}>{COPY.to}</Label>
        <Input
          id={toId}
          type="date"
          value={filters.to ?? ''}
          min={filters.from ?? undefined}
          onChange={(event) => {
            onChange({ ...filters, to: event.target.value === '' ? null : event.target.value }, true);
          }}
        />
      </div>
    </div>
  );
}
