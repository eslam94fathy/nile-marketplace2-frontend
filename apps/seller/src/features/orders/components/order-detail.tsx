'use client';

import { isApiError } from '@nile/api';
import {
  formatDateTime,
  formatRatePercent,
  SELLER_ORDER_CANCEL_REASON_LABELS,
  SELLER_ORDER_STATUS_LABELS,
  sellerOrderActions,
} from '@nile/domain';
import {
  Button,
  buttonVariants,
  Countdown,
  DataTable,
  ErrorState,
  Money,
  NotFoundScreen,
  Notice,
  PageHeader,
  SELLER_ORDER_STATUS_TONES,
  Skeleton,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useRealtimeConnected } from '@nile/realtime';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useSellerAccess } from '@/features/profile';
import { productPath, ROUTES } from '@/lib/routes';
import { isSellerOrderMissing, orderQuery, type SellerOrder, type SellerOrderItem } from '../api';
import { ORDERS_COPY as COPY } from '../copy';
import { openQuantity } from '../lib/order-math';
import { CancelItemDialog } from './cancel-item-dialog';
import { OrderActions } from './order-actions';

const TIMELINE = [
  'createdAt',
  'acceptedAt',
  'readyAt',
  'pickedUpAt',
  'deliveredAt',
  'returnedAt',
  'cancelledAt',
] as const;

/** SE-15 Order: `GET /seller/orders/{id}`, refetched on focus and every 60 s until final. */
export function OrderDetail({ sellerOrderId }: { readonly sellerOrderId: string }) {
  const live = useRealtimeConnected();
  const order = useQuery(orderQuery(sellerOrderId, live));

  if (order.isError) {
    if (isSellerOrderMissing(order.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.orders} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToOrders}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void order.refetch()}
          correlationId={isApiError(order.error) ? (order.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (order.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32 max-w-md" />
      </div>
    );
  }
  return <OrderContent order={order.data} onDeadline={() => void order.refetch()} />;
}

function OrderContent({
  order,
  onDeadline,
}: {
  readonly order: SellerOrder;
  readonly onDeadline: () => void;
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={COPY.order(order.orderNumber)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge
              value={order.status}
              labels={SELLER_ORDER_STATUS_LABELS.seller}
              tones={SELLER_ORDER_STATUS_TONES}
            />
            <span>{COPY.placedOn(formatDateTime(order.createdAt))}</span>
            <span>· {COPY.payment[order.paymentMethod]}</span>
          </span>
        }
      />
      {order.status === 'placed' && order.acceptDeadlineAt !== null ? (
        <Notice>
          <p>
            {COPY.deadline(formatDateTime(order.acceptDeadlineAt))} (
            <Countdown deadline={order.acceptDeadlineAt} label={COPY.timeToConfirm} onExpire={onDeadline} />
            ). {COPY.deadlineNote}
          </p>
        </Notice>
      ) : null}
      {order.status === 'cancelled' && order.cancelReason !== null ? (
        <p className="text-sm">
          <span className="font-medium">{COPY.cancelReason}:</span>{' '}
          {SELLER_ORDER_CANCEL_REASON_LABELS.seller[order.cancelReason]}
        </p>
      ) : null}
      <OrderActions order={order} />
      <Items order={order} />
      <div className="grid gap-8 md:grid-cols-2">
        <Section id="money" title={COPY.moneyHeading}>
          <dl className="space-y-1 text-sm">
            <Row label={COPY.subtotal} value={<Money value={order.subtotal} />} />
            <Row
              label={COPY.commission(formatRatePercent(order.commissionRate))}
              value={<Money value={order.commission} />}
            />
            <Row label={COPY.net} value={<Money value={order.sellerNet} className="font-semibold" />} />
          </dl>
          <p className="text-sm text-muted-foreground">{COPY.snapshotNote}</p>
        </Section>
        <Section id="delivery" title={COPY.deliveryHeading}>
          <p className="text-sm">{COPY.dropoff(order.dropoffGovernorate.name)}</p>
          <p className="text-sm text-muted-foreground">{COPY.customerNote}</p>
        </Section>
      </div>
      <Section id="timeline" title={COPY.timelineHeading}>
        <ol className="space-y-1 text-sm">
          {TIMELINE.map((field) => {
            const at = order[field];
            return at === null ? null : (
              <li key={field}>
                <span className="font-medium">{COPY.timeline[field]}</span> · {formatDateTime(at)}
              </li>
            );
          })}
        </ol>
      </Section>
    </div>
  );
}

function Items({ order }: { readonly order: SellerOrder }) {
  const access = useSellerAccess();
  const [cancelling, setCancelling] = useState<SellerOrderItem | null>(null);
  const canCancelItems = sellerOrderActions(order.status).includes('cancel_items');

  const columns: DataTableColumn<SellerOrderItem>[] = [
    {
      id: 'product',
      header: COPY.itemColumns.product,
      cell: (item) => (
        <span className="space-y-1">
          <Link
            href={productPath(item.productId)}
            className="block font-medium text-primary underline-offset-4 hover:underline"
          >
            {item.productName}
          </Link>
          {item.attributes.length === 0 ? null : (
            <span className="block text-muted-foreground">
              {item.attributes.map((attribute) => `${attribute.attribute}: ${attribute.value}`).join(' · ')}
            </span>
          )}
        </span>
      ),
    },
    { id: 'sku', header: COPY.itemColumns.sku, cell: (item) => item.sku },
    {
      id: 'unitPrice',
      header: COPY.itemColumns.unitPrice,
      align: 'end',
      cell: (item) => <Money value={item.unitPrice} />,
    },
    {
      id: 'quantity',
      header: COPY.itemColumns.quantity,
      align: 'end',
      cell: (item) => (
        <span className="space-y-1">
          <span className="block">{item.quantity}</span>
          {item.cancelledQuantity === 0 ? null : (
            <span className="block text-muted-foreground">
              {COPY.cancelledQuantity(item.cancelledQuantity)} · {COPY.openQuantity(openQuantity(item))}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'lineTotal',
      header: COPY.itemColumns.lineTotal,
      align: 'end',
      cell: (item) => <Money value={item.lineTotal} />,
    },
    ...(canCancelItems
      ? [
          {
            id: 'actions',
            header: COPY.itemColumns.actions,
            cell: (item: SellerOrderItem) =>
              openQuantity(item) > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!access.orders}
                  aria-label={COPY.cancelItemsAction(item.productName)}
                  onClick={() => {
                    setCancelling(item);
                  }}
                >
                  {COPY.cancelItems}
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Section id="items" title={COPY.itemsHeading}>
      <DataTable
        caption={COPY.itemsCaption}
        columns={columns}
        rows={order.items}
        getRowId={(item) => item.id}
        empty={null}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => undefined}
      />
      <CancelItemDialog
        order={order}
        item={cancelling}
        onClose={() => {
          setCancelling(null);
        }}
      />
    </Section>
  );
}

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
