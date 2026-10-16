'use client';

import { isApiError } from '@nile/api';
import {
  formatDateTime,
  formatMoney,
  formatRatePercent,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SELLER_ORDER_CANCEL_REASON_LABELS,
  SELLER_ORDER_STATUS_LABELS,
  SELLER_ORDER_STATUSES,
} from '@nile/domain';
import {
  buttonVariants,
  DataTable,
  ErrorState,
  Notice,
  NotFoundScreen,
  ORDER_STATUS_TONES,
  PageHeader,
  PAYMENT_STATUS_TONES,
  SELLER_ORDER_STATUS_TONES,
  Skeleton,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useActorLabel } from '@/features/lookups';
import { OrderPaymentSummary } from '@/features/payments';
import {
  customerOrdersPath,
  orderShipmentsPath,
  ROUTES,
  sellerOrderLedgerPath,
  sellerPath,
  shipmentPath,
} from '@/lib/routes';
import {
  isOrderMissing,
  orderQuery,
  orderShipmentsQuery,
  type AdminOrder,
  type AdminSellerOrder,
  type HistoryEntry,
} from '../api';
import { ORDERS_COPY as COPY } from '../copy';

type Item = AdminSellerOrder['items'][number];

const linkClass = 'text-primary underline-offset-4 hover:underline';

/** History statuses are plain strings in the API: known ones get their label, anything else shows as is. */
function labelOf(labels: Readonly<Record<string, string>>, known: readonly string[]) {
  return (status: string): string => (known.includes(status) ? (labels[status] ?? status) : status);
}
const orderStatusLabel = labelOf(ORDER_STATUS_LABELS.admin, ORDER_STATUSES);
const sellerOrderStatusLabel = labelOf(SELLER_ORDER_STATUS_LABELS.admin, SELLER_ORDER_STATUSES);

export interface OrderDetailProps {
  readonly orderId: string;
  readonly currentUserId: string;
}

/** AD-15 Order: read-only (no admin cancellation in R1, SPEC 09 S-9). */
export function OrderDetail({ orderId, currentUserId }: OrderDetailProps) {
  const order = useQuery(orderQuery(orderId));
  if (order.isError) {
    if (isOrderMissing(order.error)) {
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
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <OrderContent order={order.data} currentUserId={currentUserId} />;
}

function OrderContent({
  order,
  currentUserId,
}: {
  readonly order: AdminOrder;
  readonly currentUserId: string;
}) {
  const actor = useActorLabel(currentUserId);
  const shipments = useQuery(orderShipmentsQuery(order.id));
  const address = order.shippingAddress;
  const dateOrNone = (iso: string | null) => (iso === null ? COPY.none : formatDateTime(iso));
  const historyColumns = (label: (status: string) => string): readonly DataTableColumn<HistoryEntry>[] => [
    {
      id: 'change',
      header: COPY.historyColumns.change,
      cell: (row) =>
        `${row.fromStatus === null ? COPY.createdStep : label(row.fromStatus)}${COPY.arrow}${label(row.toStatus)}`,
    },
    { id: 'reason', header: COPY.historyColumns.reason, cell: (row) => row.reason ?? COPY.none },
    { id: 'by', header: COPY.historyColumns.by, cell: (row) => actor(row.actorUserId, row.actorRole) },
    { id: 'date', header: COPY.historyColumns.date, cell: (row) => formatDateTime(row.at) },
  ];
  const shipmentOf = (sellerOrderId: string) =>
    shipments.data?.find((shipment) => shipment.sellerOrderId === sellerOrderId);

  return (
    <div className="space-y-8">
      <PageHeader
        title={COPY.orderNumber(order.orderNumber)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={order.status} labels={ORDER_STATUS_LABELS.admin} tones={ORDER_STATUS_TONES} />
            <StatusBadge
              value={order.paymentStatus}
              labels={PAYMENT_STATUS_LABELS}
              tones={PAYMENT_STATUS_TONES}
            />
          </span>
        }
      />
      <Notice>{COPY.noCancel}</Notice>
      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="order-overview" title={COPY.overviewHeading}>
          <dl className="space-y-2 text-sm">
            <Row label={COPY.paymentMethod}>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</Row>
            <Row label={COPY.paymentStatus}>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</Row>
            <Row label={COPY.created}>{formatDateTime(order.createdAt)}</Row>
            <Row label={COPY.placed}>{dateOrNone(order.placedAt)}</Row>
            <Row label={COPY.completed}>{dateOrNone(order.completedAt)}</Row>
            <Row label={COPY.cancelled}>{dateOrNone(order.cancelledAt)}</Row>
            {order.status === 'pending_payment' && order.paymentExpiresAt !== null ? (
              <Row label={COPY.paymentDeadline}>{formatDateTime(order.paymentExpiresAt)}</Row>
            ) : null}
            <Row label={COPY.customer}>
              <span className="flex flex-wrap gap-x-3">
                <span>{COPY.shortId(order.customerId)}</span>
                <Link href={customerOrdersPath(order.customerId)} className={linkClass}>
                  {COPY.otherOrders}
                </Link>
              </span>
            </Row>
          </dl>
          <Link href={orderShipmentsPath(order.id)} className={`text-sm ${linkClass}`}>
            {COPY.shipments}
          </Link>
        </Section>
        <div className="space-y-8">
          <Section id="order-address" title={COPY.addressHeading}>
            <p className="text-sm">
              {address.recipientName}, {address.recipientPhone}
              <br />
              {[
                `${address.building} ${address.street}`,
                ...(address.floor === null ? [] : [COPY.floor(address.floor)]),
                ...(address.apartment === null ? [] : [COPY.apartment(address.apartment)]),
                address.area,
                address.city,
                address.governorateName,
                ...(address.landmark === null ? [] : [address.landmark]),
              ].join(', ')}
            </p>
          </Section>
          <Section id="order-totals" title={COPY.totalsHeading}>
            <dl className="space-y-2 text-sm">
              <Row label={COPY.itemsTotal}>{formatMoney(order.itemsTotal)}</Row>
              <Row label={COPY.deliveryFee}>{formatMoney(order.deliveryFee)}</Row>
              <Row label={COPY.total}>
                <span className="font-semibold">{formatMoney(order.total)}</span>
              </Row>
            </dl>
          </Section>
        </div>
      </div>
      <Section id="seller-orders" title={COPY.sellerOrdersHeading}>
        <div className="space-y-6">
          {order.sellerOrders.map((sellerOrder) => (
            <SellerOrderCard
              key={sellerOrder.id}
              sellerOrder={sellerOrder}
              shipmentId={shipmentOf(sellerOrder.id)?.id ?? null}
              shipmentsLoading={shipments.isPending}
              historyColumns={historyColumns(sellerOrderStatusLabel)}
            />
          ))}
        </div>
      </Section>
      <Section id="order-history" title={COPY.historyHeading}>
        <DataTable
          caption={COPY.orderHistoryCaption}
          columns={historyColumns(orderStatusLabel)}
          rows={order.statusHistory}
          getRowId={(row) => `${row.at}-${row.toStatus}`}
          empty={<p className="text-sm text-muted-foreground">{COPY.noHistory}</p>}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      </Section>
      <OrderPaymentSummary orderId={order.id} currentUserId={currentUserId} />
    </div>
  );
}

interface SellerOrderCardProps {
  readonly sellerOrder: AdminSellerOrder;
  readonly shipmentId: string | null;
  readonly shipmentsLoading: boolean;
  readonly historyColumns: readonly DataTableColumn<HistoryEntry>[];
}

/** AD-15 item 4: one seller order with items, money, timeline, history, shipment and ledger link. */
function SellerOrderCard({
  sellerOrder,
  shipmentId,
  shipmentsLoading,
  historyColumns,
}: SellerOrderCardProps) {
  const headingId = `seller-order-${sellerOrder.id}`;
  const itemColumns: readonly DataTableColumn<Item>[] = [
    {
      id: 'product',
      header: COPY.itemColumns.product,
      cell: (item) => (
        <span className="flex flex-col">
          <span>{item.productName}</span>
          <span className="text-muted-foreground">
            {item.attributes.map((attribute) => `${attribute.attribute}: ${attribute.value}`).join(', ')}
          </span>
        </span>
      ),
    },
    { id: 'sku', header: COPY.itemColumns.sku, cell: (item) => item.sku },
    {
      id: 'unitPrice',
      header: COPY.itemColumns.unitPrice,
      align: 'end',
      cell: (item) => formatMoney(item.unitPrice),
    },
    { id: 'quantity', header: COPY.itemColumns.quantity, align: 'end', cell: (item) => item.quantity },
    {
      id: 'cancelled',
      header: COPY.itemColumns.cancelled,
      align: 'end',
      cell: (item) => item.cancelledQuantity,
    },
    {
      id: 'lineTotal',
      header: COPY.itemColumns.lineTotal,
      align: 'end',
      cell: (item) => formatMoney(item.lineTotal),
    },
  ];

  let shipment: ReactNode = COPY.noShipment;
  if (shipmentsLoading) shipment = <Skeleton className="h-4 w-24" />;
  else if (shipmentId !== null) {
    shipment = (
      <Link href={shipmentPath(shipmentId)} className={linkClass}>
        {COPY.openShipment}
      </Link>
    );
  }

  return (
    <article aria-labelledby={headingId} className="space-y-4 rounded-lg border border-border p-4">
      <header className="flex flex-wrap items-center gap-3">
        <h3 id={headingId} className="font-semibold">
          <Link href={sellerPath(sellerOrder.sellerId)} className={linkClass}>
            {sellerOrder.businessName}
          </Link>
        </h3>
        <StatusBadge
          value={sellerOrder.status}
          labels={SELLER_ORDER_STATUS_LABELS.admin}
          tones={SELLER_ORDER_STATUS_TONES}
        />
      </header>
      <DataTable
        caption={COPY.itemsCaption(sellerOrder.businessName)}
        columns={itemColumns}
        rows={sellerOrder.items}
        getRowId={(item) => item.id}
        empty={null}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => undefined}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <dl className="space-y-2 text-sm">
          {sellerOrder.cancelReason === null ? null : (
            <Row label={COPY.cancelReason}>
              {SELLER_ORDER_CANCEL_REASON_LABELS.admin[sellerOrder.cancelReason]}
            </Row>
          )}
          <Row label={COPY.subtotal}>{formatMoney(sellerOrder.subtotal)}</Row>
          <Row label={COPY.commission}>
            {COPY.commissionValue(
              formatRatePercent(sellerOrder.commissionRate),
              formatMoney(sellerOrder.commission),
            )}
          </Row>
          <Row label={COPY.sellerNet}>{formatMoney(sellerOrder.sellerNet)}</Row>
          <Row label={COPY.shipment}>{shipment}</Row>
          <Row label={COPY.ledger}>
            <Link href={sellerOrderLedgerPath(sellerOrder.id)} className={linkClass}>
              {COPY.ledger}
            </Link>
          </Row>
        </dl>
        <div className="space-y-2 text-sm">
          <h4 className="font-medium">{COPY.timelineHeading}</h4>
          <ol className="space-y-1">
            {sellerOrder.timeline.map((entry) => (
              <li key={`${entry.status}-${entry.at}`}>
                <span className="font-medium">{SELLER_ORDER_STATUS_LABELS.admin[entry.status]}</span> ·{' '}
                {formatDateTime(entry.at)}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <DataTable
        caption={COPY.sellerHistoryCaption(sellerOrder.businessName)}
        showCaption
        columns={historyColumns}
        rows={sellerOrder.statusHistory}
        getRowId={(row) => `${row.at}-${row.toStatus}`}
        empty={<p className="text-sm text-muted-foreground">{COPY.noHistory}</p>}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => undefined}
      />
    </article>
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

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
