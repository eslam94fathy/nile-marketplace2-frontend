'use client';

import { isApiError } from '@nile/api';
import { formatDate, formatMoney, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@nile/domain';
import {
  Button,
  buttonVariants,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  ORDER_STATUS_TONES,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { orderPath, ROUTES } from '@/lib/routes';
import { ordersListOptions, type AdminOrderSummary } from '../api';
import { ORDERS_COPY as COPY } from '../copy';
import {
  hasNarrowingFilters,
  ORDER_NUMBER_MAX,
  ORDER_TABS,
  orderFiltersQuery,
  parseOrderFilters,
  type OrderFilters,
  type OrderTab,
  type RawOrderParams,
} from '../lib/list-params';

const TABS = Object.keys(ORDER_TABS) as OrderTab[];

const listHref = (filters: OrderFilters): Route => {
  const query = orderFiltersQuery(filters);
  return query === '' ? ROUTES.orders : `${ROUTES.orders}?${query}`;
};

/** AD-14 Orders: status tabs, exact order number, customer and created dates, all in the URL. */
export function OrdersList({ params }: { readonly params: RawOrderParams }) {
  const filters = parseOrderFilters(params);
  const router = useRouter();
  const orders = useInfiniteQuery(ordersListOptions(filters));
  const navigate = (next: OrderFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };

  const columns: readonly DataTableColumn<AdminOrderSummary>[] = [
    {
      id: 'order',
      header: COPY.columns.order,
      cell: (order) => (
        <Link
          href={orderPath(order.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {COPY.orderNumber(order.orderNumber)}
        </Link>
      ),
    },
    { id: 'created', header: COPY.columns.created, cell: (order) => formatDate(order.createdAt) },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (order) => (
        <StatusBadge value={order.status} labels={ORDER_STATUS_LABELS.admin} tones={ORDER_STATUS_TONES} />
      ),
    },
    {
      id: 'payment',
      header: COPY.columns.payment,
      cell: (order) => PAYMENT_METHOD_LABELS[order.paymentMethod],
    },
    { id: 'total', header: COPY.columns.total, align: 'end', cell: (order) => formatMoney(order.total) },
    { id: 'items', header: COPY.columns.items, align: 'end', cell: (order) => order.itemCount },
    {
      id: 'sellerOrders',
      header: COPY.columns.sellerOrders,
      align: 'end',
      cell: (order) => order.sellerOrderCount,
    },
    { id: 'customer', header: COPY.columns.customer, cell: (order) => COPY.shortId(order.customerId) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
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
      {orders.isError ? (
        <ErrorState
          message={COPY.listFailed}
          onRetry={() => void orders.refetch()}
          correlationId={isApiError(orders.error) ? (orders.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={orders.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(order) => order.id}
          loading={orders.isPending}
          hasMore={orders.hasNextPage}
          loadingMore={orders.isFetchingNextPage}
          onLoadMore={() => void orders.fetchNextPage()}
          toolbar={<Filters key={filters.orderNumber ?? ''} filters={filters} onChange={navigate} />}
          empty={
            hasNarrowingFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link
                    href={listHref({ ...filters, orderNumber: null, customerId: null, from: null, to: null })}
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
  readonly filters: OrderFilters;
  readonly onChange: (next: OrderFilters, replace?: boolean) => void;
}

/** The order number is an exact match: it is sent on "Find" (or Enter), not while typing. */
function Filters({ filters, onChange }: FiltersProps) {
  const id = useId();
  const [number, setNumber] = useState(filters.orderNumber ?? '');
  return (
    <div className="mb-4 space-y-3">
      {filters.customerId === null ? null : (
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">{COPY.customerFilter(filters.customerId)}</span>
          <Link
            href={listHref({ ...filters, customerId: null })}
            className="text-primary underline-offset-4 hover:underline"
          >
            {COPY.clearCustomer}
          </Link>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <form
          role="search"
          className="space-y-1"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = number.trim();
            onChange({ ...filters, orderNumber: trimmed === '' ? null : trimmed });
          }}
        >
          <Label htmlFor={`${id}-number`}>{COPY.numberSearch}</Label>
          <div className="flex gap-2">
            <Input
              id={`${id}-number`}
              type="search"
              value={number}
              maxLength={ORDER_NUMBER_MAX}
              aria-describedby={`${id}-number-help`}
              onChange={(event) => {
                setNumber(event.target.value);
              }}
            />
            <Button type="submit" variant="outline">
              {COPY.search}
            </Button>
          </div>
          <p id={`${id}-number-help`} className="text-xs text-muted-foreground">
            {COPY.numberHelp}
          </p>
        </form>
        <div className="space-y-1">
          <Label htmlFor={`${id}-from`}>{COPY.from}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={filters.from ?? ''}
            max={filters.to ?? undefined}
            onChange={(event) => {
              onChange({ ...filters, from: event.target.value === '' ? null : event.target.value }, true);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-to`}>{COPY.to}</Label>
          <Input
            id={`${id}-to`}
            type="date"
            value={filters.to ?? ''}
            min={filters.from ?? undefined}
            onChange={(event) => {
              onChange({ ...filters, to: event.target.value === '' ? null : event.target.value }, true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
