'use client';

import { isApiError } from '@nile/api';
import { COUPON_DISPLAY_STATUS_LABELS, COUPON_SCOPE_LABELS, formatDateTime } from '@nile/domain';
import { categoriesTreeQuery } from '@nile/query';
import {
  Badge,
  buttonVariants,
  cn,
  COUPON_DISPLAY_STATUS_TONES,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useMemo } from 'react';
import { categoryChoices } from '@/features/products';
import { useSellerAccess } from '@/features/profile';
import { browserApi } from '@/lib/browser-api';
import { couponPath, ROUTES } from '@/lib/routes';
import { couponsListOptions, type Coupon, type CouponStatusFilter } from '../api';
import { COUPONS_COPY as COPY } from '../copy';
import { COUPON_STATUS_PARAM, couponStatusFilter, discountText, scopeText } from '../lib/display';

const TABS = [
  { status: null, label: COPY.tabs.all },
  { status: 'active', label: COPY.tabs.active },
  { status: 'inactive', label: COPY.tabs.inactive },
] as const satisfies readonly { status: CouponStatusFilter; label: string }[];

const tabHref = (status: CouponStatusFilter): Route =>
  status === null ? ROUTES.coupons : `${ROUTES.coupons}?${COUPON_STATUS_PARAM}=${status}`;

/** SE-21 Coupons: `?status=` in the URL, newest first, "Load more"; "New coupon" for approved sellers. */
export function CouponsList({ status: statusParam }: { readonly status: string | null }) {
  const status = couponStatusFilter(statusParam);
  const access = useSellerAccess();
  const coupons = useInfiniteQuery(couponsListOptions(status));
  const tree = useQuery(categoriesTreeQuery(browserApi));
  const choices = useMemo(() => categoryChoices(tree.data ?? []), [tree.data]);
  const rows = coupons.data?.pages.flatMap((page) => page.data) ?? [];

  const columns: DataTableColumn<Coupon>[] = [
    {
      id: 'code',
      header: COPY.columns.code,
      cell: (coupon) => (
        <Link
          href={couponPath(coupon.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {coupon.code}
        </Link>
      ),
    },
    { id: 'discount', header: COPY.columns.discount, cell: discountText },
    {
      id: 'scope',
      header: COPY.columns.scope,
      // The category path is known once the tree is read.
      cell: (coupon) =>
        coupon.scope === 'category' && !tree.isSuccess
          ? null
          : scopeText(coupon, choices, COUPON_SCOPE_LABELS.seller.seller),
    },
    {
      id: 'dates',
      header: COPY.columns.dates,
      cell: (coupon) => COPY.validRange(formatDateTime(coupon.startsAt), formatDateTime(coupon.endsAt)),
    },
    {
      id: 'uses',
      header: COPY.columns.uses,
      align: 'end',
      cell: (coupon) => COPY.uses(coupon.redemptionCount, coupon.globalLimit),
    },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (coupon) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge
            value={coupon.displayStatus}
            labels={COUPON_DISPLAY_STATUS_LABELS}
            tones={COUPON_DISPLAY_STATUS_TONES}
          />
          {coupon.adminBlocked ? <Badge tone="warning">{COPY.blockedBadge}</Badge> : null}
        </span>
      ),
    },
  ];

  const newCoupon = access.catalog ? (
    <Link href={ROUTES.newCoupon} className={buttonVariants()}>
      {COPY.newCoupon}
    </Link>
  ) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} actions={newCoupon ?? undefined} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const current = tab.status === status;
            return (
              <li key={tab.label}>
                <Link
                  href={tabHref(tab.status)}
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
          empty={
            status === null ? (
              <EmptyState
                title={COPY.empty}
                {...(access.reason === null ? {} : { description: access.reason })}
                action={newCoupon}
              />
            ) : (
              <EmptyState title={COPY.emptyFiltered} />
            )
          }
          hasMore={coupons.hasNextPage}
          loadingMore={coupons.isFetchingNextPage}
          onLoadMore={() => void coupons.fetchNextPage()}
        />
      )}
    </div>
  );
}
