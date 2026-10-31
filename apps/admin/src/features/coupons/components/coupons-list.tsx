'use client';

import { isApiError } from '@nile/api';
import {
  COUPON_DISPLAY_STATUS_LABELS,
  COUPON_FUNDING_LABELS,
  COUPON_FUNDINGS,
  COUPON_SCOPE_LABELS,
  COUPON_STATUSES,
  formatDate,
} from '@nile/domain';
import {
  Badge,
  Button,
  buttonVariants,
  COUPON_DISPLAY_STATUS_TONES,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Select,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import { categoryTreeQuery } from '@/features/catalog';
import { useSellerNames } from '@/features/lookups';
import { couponPath, NEW_COUPON_PATH, ROUTES } from '@/lib/routes';
import { couponsListOptions, type Coupon } from '../api';
import { COUPONS_COPY as COPY } from '../copy';
import { categoryChoices, discountText, fundingText, scopeText } from '../lib/display';
import {
  couponFiltersQuery,
  hasCouponFilters,
  NO_COUPON_FILTERS,
  normaliseCode,
  parseCouponFilters,
  type CouponFilters,
  type RawCouponParams,
} from '../lib/list-params';

const ALL = 'all';
const LINK = 'font-medium text-primary underline-offset-4 hover:underline';

const listHref = (filters: CouponFilters): Route => {
  const query = couponFiltersQuery(filters);
  return query === '' ? ROUTES.coupons : `${ROUTES.coupons}?${query}`;
};

/** AD-35 Coupons: Nile's and sellers' coupons, newest first; funding, status, seller and code in the URL. */
export function CouponsList({ params }: { readonly params: RawCouponParams }) {
  const filters = parseCouponFilters(params);
  const router = useRouter();
  const coupons = useInfiniteQuery(couponsListOptions(filters));
  const rows = coupons.data?.pages.flatMap((page) => page.data) ?? [];
  const sellerName = useSellerNames([
    ...rows.flatMap((coupon) => [coupon.sellerId, coupon.scopeSellerId]),
    filters.sellerId,
  ]);
  const tree = useQuery(categoryTreeQuery());
  const categories = useMemo(() => categoryChoices(tree.data ?? []), [tree.data]);
  const navigate = (next: CouponFilters) => {
    router.push(listHref(next));
  };

  const columns: readonly DataTableColumn<Coupon>[] = [
    {
      id: 'code',
      header: COPY.columns.code,
      cell: (coupon) => (
        <Link href={couponPath(coupon.id)} className={`font-mono ${LINK}`}>
          {coupon.code}
        </Link>
      ),
    },
    {
      id: 'funding',
      header: COPY.columns.funding,
      cell: (coupon) => fundingText(coupon, sellerName, COUPON_FUNDING_LABELS.platform),
    },
    { id: 'discount', header: COPY.columns.discount, cell: (coupon) => discountText(coupon) },
    {
      id: 'scope',
      header: COPY.columns.scope,
      cell: (coupon) =>
        scopeText(coupon, { allLabel: COUPON_SCOPE_LABELS.admin.all, sellerName, categories }),
    },
    {
      id: 'dates',
      header: COPY.columns.dates,
      cell: (coupon) => COPY.validRange(formatDate(coupon.startsAt), formatDate(coupon.endsAt)),
    },
    {
      id: 'uses',
      header: COPY.columns.uses,
      cell: (coupon) => COPY.uses(coupon.redemptionCount, coupon.globalLimit),
    },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (coupon) => (
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge
            value={coupon.displayStatus}
            labels={COUPON_DISPLAY_STATUS_LABELS}
            tones={COUPON_DISPLAY_STATUS_TONES}
          />
          {coupon.adminBlocked ? <Badge tone="destructive">{COPY.blockedBadge}</Badge> : null}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={COPY.title}
        actions={
          <Link href={NEW_COUPON_PATH} className={buttonVariants()}>
            {COPY.newCoupon}
          </Link>
        }
      />
      {coupons.isError ? (
        <ErrorState
          message={COPY.listFailed}
          onRetry={() => void coupons.refetch()}
          correlationId={isApiError(coupons.error) ? (coupons.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={rows}
          getRowId={(coupon) => coupon.id}
          loading={coupons.isPending}
          hasMore={coupons.hasNextPage}
          loadingMore={coupons.isFetchingNextPage}
          onLoadMore={() => void coupons.fetchNextPage()}
          toolbar={<Filters filters={filters} sellerName={sellerName} onChange={navigate} />}
          empty={
            hasCouponFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link href={listHref(NO_COUPON_FILTERS)} className={buttonVariants({ variant: 'outline' })}>
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

function Filters({
  filters,
  sellerName,
  onChange,
}: {
  readonly filters: CouponFilters;
  readonly sellerName: (id: string) => string | null;
  readonly onChange: (next: CouponFilters) => void;
}) {
  const id = useId();
  const [code, setCode] = useState(filters.code ?? '');
  const sellerLabel =
    filters.sellerId === null
      ? null
      : COPY.sellerScope(sellerName(filters.sellerId) ?? COPY.shortId(filters.sellerId));

  return (
    <div className="mb-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-funding`}>{COPY.fundingFilter}</Label>
          <Select
            id={`${id}-funding`}
            options={[
              { value: ALL, label: COPY.allFunding },
              ...COUPON_FUNDINGS.map((funding) => ({
                value: funding,
                label: COUPON_FUNDING_LABELS[funding],
              })),
            ]}
            value={filters.funding ?? ALL}
            onValueChange={(value) => {
              onChange({ ...filters, funding: COUPON_FUNDINGS.find((funding) => funding === value) ?? null });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-status`}>{COPY.statusFilter}</Label>
          <Select
            id={`${id}-status`}
            options={[
              { value: ALL, label: COPY.allStatuses },
              ...COUPON_STATUSES.map((status) => ({ value: status, label: COPY.statuses[status] })),
            ]}
            value={filters.status ?? ALL}
            onValueChange={(value) => {
              onChange({ ...filters, status: COUPON_STATUSES.find((status) => status === value) ?? null });
            }}
          />
        </div>
        <form
          role="search"
          className="space-y-1"
          onSubmit={(event) => {
            event.preventDefault();
            onChange({ ...filters, code: normaliseCode(code) });
          }}
        >
          <Label htmlFor={`${id}-code`}>{COPY.codeFilter}</Label>
          <div className="flex gap-2">
            <Input
              id={`${id}-code`}
              value={code}
              maxLength={32}
              autoComplete="off"
              className="uppercase"
              aria-describedby={`${id}-code-hint`}
              onChange={(event) => {
                setCode(event.target.value);
              }}
            />
            <Button type="submit" variant="outline">
              {COPY.find}
            </Button>
          </div>
          <p id={`${id}-code-hint`} className="text-xs text-muted-foreground">
            {COPY.codeHint}
          </p>
        </form>
      </div>
      {sellerLabel === null ? null : (
        <ul aria-label={COPY.scopeLabel} className="flex flex-wrap gap-2">
          <li>
            <span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-input ps-3 text-sm">
              {sellerLabel}
              <Link
                href={listHref({ ...filters, sellerId: null })}
                aria-label={COPY.removeScope(sellerLabel)}
                className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </Link>
            </span>
          </li>
        </ul>
      )}
    </div>
  );
}
