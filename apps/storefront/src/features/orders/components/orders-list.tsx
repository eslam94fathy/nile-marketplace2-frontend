'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@nile/domain';
import {
  buttonVariants,
  cn,
  EmptyState,
  ErrorState,
  LoadMore,
  Money,
  ORDER_STATUS_TONES,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { orderPath, ROUTES } from '@/lib/routes';
import { ordersListOptions } from '../api';
import { ORDERS_COPY } from '../copy';
import { ORDER_TAB_PARAM, ORDER_TABS, orderTab } from '../lib/order-tabs';

const tabHref = (key: string) =>
  key === 'all' ? ROUTES.orders : (`${ROUTES.orders}?${ORDER_TAB_PARAM}=${key}` as const);

/** SF-17 Orders: status tabs (in the URL), newest first, "Load more". */
export function OrdersList({ tab: tabParam }: { readonly tab: string | null }) {
  const tab = orderTab(tabParam);
  const orders = useInfiniteQuery(ordersListOptions(tab.statuses));
  const items = orders.data?.pages.flatMap((page) => page.data) ?? [];

  let body;
  if (orders.isError) {
    body = (
      <ErrorState
        message={ORDERS_COPY.listLoadFailed}
        onRetry={() => void orders.refetch()}
        correlationId={isApiError(orders.error) ? (orders.error.correlationId ?? undefined) : undefined}
      />
    );
  } else if (orders.data === undefined) {
    body = (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  } else if (items.length === 0) {
    body =
      tab.key === 'all' ? (
        <EmptyState
          title={ORDERS_COPY.emptyAll}
          action={
            <Link href={ROUTES.home} className={buttonVariants()}>
              {ORDERS_COPY.startShopping}
            </Link>
          }
        />
      ) : (
        <EmptyState title={ORDERS_COPY.emptyTab} />
      );
  } else {
    body = (
      <div className="space-y-4">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((order) => (
            <li key={order.id}>
              <Link
                href={orderPath(order.id)}
                className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 p-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="space-y-1">
                  <span className="block font-medium">{ORDERS_COPY.order(order.orderNumber)}</span>
                  <span className="block text-sm text-muted-foreground">
                    {formatDateTime(order.createdAt)} · {PAYMENT_METHOD_LABELS[order.paymentMethod]}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {ORDERS_COPY.contents(order.itemCount, order.sellerOrderCount)}
                  </span>
                </span>
                <span className="flex items-center gap-4">
                  <StatusBadge
                    value={order.status}
                    labels={ORDER_STATUS_LABELS.customer}
                    tones={ORDER_STATUS_TONES}
                  />
                  <Money value={order.total} className="font-medium" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <LoadMore
          hasMore={orders.hasNextPage}
          loading={orders.isFetchingNextPage}
          loadedCount={items.length}
          onLoadMore={() => void orders.fetchNextPage()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={ORDERS_COPY.title} />
      <nav aria-label={ORDERS_COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {ORDER_TABS.map((item) => {
            const current = item.key === tab.key;
            return (
              <li key={item.key}>
                <Link
                  href={tabHref(item.key)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {body}
    </div>
  );
}
