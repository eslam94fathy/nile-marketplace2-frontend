'use client';

import { isApiError } from '@nile/api';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  RETURN_REASON_LABELS,
  RETURN_REASONS,
  RETURN_STATUS_LABELS,
  type ReturnReason,
} from '@nile/domain';
import {
  buttonVariants,
  Checkbox,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  RETURN_STATUS_TONES,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { customerQuery } from '@/features/customers';
import { useSellerNames } from '@/features/lookups';
import { orderPath, returnPath, ROUTES, sellerPath } from '@/lib/routes';
import { returnsListOptions, type AdminReturn } from '../api';
import { RETURNS_COPY as COPY } from '../copy';
import { currentDeadline } from '../lib/deadline';
import {
  hasReturnFilters,
  parseReturnFilters,
  RETURN_TAB_KEYS,
  returnFiltersQuery,
  type RawReturnParams,
  type ReturnFilters,
} from '../lib/list-params';

const LINK = 'text-primary underline-offset-4 hover:underline';

const listHref = (filters: ReturnFilters): Route => {
  const query = returnFiltersQuery(filters);
  return query === '' ? ROUTES.returns : `${ROUTES.returns}?${query}`;
};

/**
 * AD-32 Returns: status tabs (Needs decision first), reasons, and a seller or customer scope from the AD-05 / AD-26
 * links, all in the URL; newest first. Live through `return.updated`.
 */
export function ReturnsList({ params }: { readonly params: RawReturnParams }) {
  const filters = parseReturnFilters(params);
  const router = useRouter();
  const returns = useInfiniteQuery(returnsListOptions(filters));
  const rows = returns.data?.pages.flatMap((page) => page.data) ?? [];
  const sellerName = useSellerNames([...rows.map((item) => item.sellerId), filters.sellerId]);

  const columns: readonly DataTableColumn<AdminReturn>[] = [
    {
      id: 'return',
      header: COPY.columns.return,
      cell: (item) => (
        <Link href={returnPath(item.id)} className={`font-medium ${LINK}`}>
          {item.returnNumber}
        </Link>
      ),
    },
    {
      id: 'order',
      header: COPY.columns.order,
      cell: (item) => (
        <Link href={orderPath(item.orderId)} className={LINK}>
          {COPY.orderNumber(item.orderNumber)}
        </Link>
      ),
    },
    {
      id: 'seller',
      header: COPY.columns.seller,
      cell: (item) => (
        <Link href={sellerPath(item.sellerId)} className={LINK}>
          {sellerName(item.sellerId) ?? COPY.shortId(item.sellerId)}
        </Link>
      ),
    },
    { id: 'reason', header: COPY.columns.reason, cell: (item) => RETURN_REASON_LABELS.staff[item.reason] },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (item) => (
        <StatusBadge value={item.status} labels={RETURN_STATUS_LABELS.admin} tones={RETURN_STATUS_TONES} />
      ),
    },
    {
      id: 'refund',
      header: COPY.columns.refund,
      align: 'end',
      cell: (item) => formatMoney(item.refundAmount),
    },
    { id: 'created', header: COPY.columns.created, cell: (item) => formatDate(item.createdAt) },
    {
      id: 'deadline',
      header: COPY.columns.deadline,
      cell: (item) => {
        const deadline = currentDeadline(item);
        return deadline === null ? COPY.none : formatDateTime(deadline.at);
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {RETURN_TAB_KEYS.map((tab) => {
            const current = tab === filters.tab;
            return (
              <li key={tab}>
                <Link
                  href={listHref({ ...filters, tab })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {COPY.tabs[tab]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {returns.isError ? (
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void returns.refetch()}
          correlationId={isApiError(returns.error) ? (returns.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={rows}
          getRowId={(item) => item.id}
          loading={returns.isPending}
          hasMore={returns.hasNextPage}
          loadingMore={returns.isFetchingNextPage}
          onLoadMore={() => void returns.fetchNextPage()}
          toolbar={
            <Filters
              filters={filters}
              sellerName={sellerName}
              onChange={(next) => {
                router.push(listHref(next));
              }}
            />
          }
          empty={
            hasReturnFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link
                    href={listHref({ tab: filters.tab, reasons: [], sellerId: null, customerId: null })}
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

function Filters({
  filters,
  sellerName,
  onChange,
}: {
  readonly filters: ReturnFilters;
  readonly sellerName: (id: string) => string | null;
  readonly onChange: (next: ReturnFilters) => void;
}) {
  const id = useId();
  const customer = useQuery({
    ...customerQuery(filters.customerId ?? ''),
    enabled: filters.customerId !== null,
  });
  const customerName =
    customer.data === undefined ? null : `${customer.data.firstName} ${customer.data.lastName}`.trim();
  const toggle = (reason: ReturnReason, checked: boolean) => {
    const reasons = checked
      ? RETURN_REASONS.filter((value) => value === reason || filters.reasons.includes(value))
      : filters.reasons.filter((value) => value !== reason);
    onChange({ ...filters, reasons });
  };

  const scopes = [
    ...(filters.sellerId === null
      ? []
      : [
          {
            key: 'seller',
            label: COPY.sellerScope(sellerName(filters.sellerId) ?? COPY.shortId(filters.sellerId)),
            href: listHref({ ...filters, sellerId: null }),
          },
        ]),
    ...(filters.customerId === null
      ? []
      : [
          {
            key: 'customer',
            label: COPY.customerScope(customerName ?? COPY.shortId(filters.customerId)),
            href: listHref({ ...filters, customerId: null }),
          },
        ]),
  ];

  return (
    <div className="mb-4 space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{COPY.reasonFilter}</legend>
        <div className="flex flex-wrap gap-4">
          {RETURN_REASONS.map((reason) => (
            <label key={reason} htmlFor={`${id}-${reason}`} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${id}-${reason}`}
                checked={filters.reasons.includes(reason)}
                onCheckedChange={(checked) => {
                  toggle(reason, checked === true);
                }}
              />
              {RETURN_REASON_LABELS.staff[reason]}
            </label>
          ))}
        </div>
      </fieldset>
      {scopes.length === 0 ? null : (
        <ul aria-label={COPY.scopeLabel} className="flex flex-wrap gap-2">
          {scopes.map((scope) => (
            <li key={scope.key}>
              <span className="inline-flex min-h-9 items-center gap-1 rounded-full border border-input ps-3 text-sm">
                {scope.label}
                <Link
                  href={scope.href}
                  aria-label={COPY.removeScope(scope.label)}
                  className="inline-flex size-9 items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="size-4" aria-hidden="true" />
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
