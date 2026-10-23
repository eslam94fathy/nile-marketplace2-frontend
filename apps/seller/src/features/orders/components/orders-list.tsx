'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, SELLER_ORDER_STATUS_LABELS } from '@nile/domain';
import {
  buttonVariants,
  cn,
  Countdown,
  DataTable,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  SELLER_ORDER_STATUS_TONES,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { orderPath, ROUTES } from '@/lib/routes';
import { ordersListOptions, type SellerOrder } from '../api';
import { ORDERS_COPY as COPY } from '../copy';
import { openItemCount } from '../lib/order-math';
import { ORDER_TAB_PARAM, ORDER_TABS, orderTab, type OrderTabKey } from '../lib/tabs';

const tabHref = (key: OrderTabKey): Route =>
  key === ORDER_TABS[0].key ? ROUTES.orders : `${ROUTES.orders}?${ORDER_TAB_PARAM}=${key}`;

/** SE-14 Orders: tabs in the URL (`?tab=`, default "To confirm"), polled every 60 s while visible. */
export function OrdersList({ tab: tabParam }: { readonly tab: string | null }) {
  const tab = orderTab(tabParam);
  const orders = useInfiniteQuery(ordersListOptions(tab));
  const rows = orders.data?.pages.flatMap((page) => page.data) ?? [];

  const columns: DataTableColumn<SellerOrder>[] = [
    {
      id: 'order',
      header: COPY.columns.order,
      cell: (order) => (
        <Link
          href={orderPath(order.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {COPY.order(order.orderNumber)}
        </Link>
      ),
    },
    { id: 'date', header: COPY.columns.date, cell: (order) => formatDateTime(order.createdAt) },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (order) => (
        <StatusBadge
          value={order.status}
          labels={SELLER_ORDER_STATUS_LABELS.seller}
          tones={SELLER_ORDER_STATUS_TONES}
        />
      ),
    },
    ...(tab.key === 'to-confirm'
      ? [
          {
            id: 'deadline',
            header: COPY.columns.deadline,
            cell: (order: SellerOrder) =>
              order.acceptDeadlineAt === null ? null : (
                <Countdown
                  deadline={order.acceptDeadlineAt}
                  label={COPY.timeToConfirm}
                  // The backend cancels it soon after: show the new state.
                  onExpire={() => void orders.refetch()}
                />
              ),
          },
        ]
      : []),
    { id: 'payment', header: COPY.columns.payment, cell: (order) => COPY.payment[order.paymentMethod] },
    {
      id: 'items',
      header: COPY.columns.items,
      align: 'end',
      cell: (order) => COPY.itemCount(openItemCount(order)),
    },
    {
      id: 'subtotal',
      header: COPY.columns.subtotal,
      align: 'end',
      cell: (order) => <Money value={order.subtotal} />,
    },
    { id: 'net', header: COPY.columns.net, align: 'end', cell: (order) => <Money value={order.sellerNet} /> },
    { id: 'dropoff', header: COPY.columns.dropoff, cell: (order) => order.dropoffGovernorate.name },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.tabsLabel}>
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
                  {COPY.tabs[item.key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {orders.isError ? (
        <ErrorState
          message={COPY.listLoadFailed}
          onRetry={() => void orders.refetch()}
          correlationId={isApiError(orders.error) ? (orders.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={rows}
          getRowId={(order) => order.id}
          loading={orders.isPending}
          empty={<EmptyState title={COPY.empty[tab.key]} />}
          hasMore={orders.hasNextPage}
          loadingMore={orders.isFetchingNextPage}
          onLoadMore={() => void orders.fetchNextPage()}
        />
      )}
    </div>
  );
}
