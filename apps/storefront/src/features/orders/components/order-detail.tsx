'use client';

import { isApiError } from '@nile/api';
import {
  formatDateTime,
  formatMoney,
  ORDER_STATUS_LABELS,
  parseMoney,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  SELLER_ORDER_CANCEL_REASON_LABELS,
  SELLER_ORDER_STATUS_LABELS,
} from '@nile/domain';
import { useRealtimeConnected } from '@nile/realtime';
import {
  buttonVariants,
  Countdown,
  ErrorState,
  Money,
  NileImage,
  NotFoundScreen,
  ORDER_STATUS_TONES,
  PageHeader,
  SELLER_ORDER_STATUS_TONES,
  Skeleton,
  StatusBadge,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { addressLines } from '@/features/addresses';
import { productHref } from '@/features/catalog';
import { ROUTES, requestReturnPath } from '@/lib/routes';
import { isOrderMissing, orderQuery, type Order } from '../api';
import { ORDERS_COPY } from '../copy';
import { PayNow } from '../payment/pay-now';
import { BuyAgain } from './buy-again';
import { WriteReviewLink } from '@/features/reviews';
import { CancelSellerOrder } from './cancel-seller-order';
import { ItemAmount, OrderTotals } from './order-amounts';
import { returnWindowEnd } from '../lib/return-window';
import { usePassed } from '@/lib/use-passed';

const COPY = ORDERS_COPY;

/**
 * SF-18: refetch every 30 s while visible, only while the order awaits payment and no socket is connected
 * (spec 01 v1.2 §10: the order's messages refresh it otherwise).
 */
export const AWAITING_PAYMENT_POLL_MS = 30_000;

type SellerOrder = Order['sellerOrders'][number];

/** Seller orders that don't count towards the total (spec 01 SF-18 §5, [SPEC 09 OR-13]). */
const EXCLUDED: ReadonlySet<SellerOrder['status']> = new Set(['cancelled', 'returned_to_seller']);

/** Card payments that may need a refund when something was cancelled (spec 01 SF-18 §5, §10.3). */
const REFUNDABLE: ReadonlySet<Order['paymentStatus']> = new Set(['paid', 'partially_refunded']);

/** The notes under the totals (spec 01 SF-18 §5). */
function totalNotes(order: Order): string[] {
  const excluded = order.sellerOrders.some((sellerOrder) => EXCLUDED.has(sellerOrder.status));
  const itemsCancelled = order.sellerOrders.some((sellerOrder) =>
    sellerOrder.items.some((item) => item.cancelledQuantity > 0),
  );
  const notes: string[] = [];
  if (excluded) notes.push(COPY.notes.excluded);
  if (order.status === 'cancelled' && parseMoney(order.deliveryFee).isZero()) notes.push(COPY.notes.noFee);
  if (REFUNDABLE.has(order.paymentStatus) && (excluded || itemsCancelled)) notes.push(COPY.notes.refunds);
  return notes;
}

/** SF-18 Order detail: only data from `GET /orders/{orderId}`; someone else's order is "not found". */
export function OrderDetail({ orderId }: { readonly orderId: string }) {
  const live = useRealtimeConnected();
  const order = useQuery({
    ...orderQuery(orderId),
    refetchInterval: (query) =>
      !live && query.state.data?.status === 'pending_payment' ? AWAITING_PAYMENT_POLL_MS : false,
    refetchOnWindowFocus: true,
  });

  if (order.isError) {
    if (isOrderMissing(order.error)) {
      return (
        <NotFoundScreen
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
          message={COPY.detailLoadFailed}
          onRetry={() => void order.refetch()}
          correlationId={isApiError(order.error) ? (order.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (order.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  const data = order.data;
  const address = data.shippingAddress;
  const lines = addressLines(address, address.governorateName);
  const notes = totalNotes(data);
  return (
    <div className="space-y-8">
      <PageHeader
        title={COPY.order(data.orderNumber)}
        description={COPY.placedOn(formatDateTime(data.createdAt))}
        actions={
          <StatusBadge value={data.status} labels={ORDER_STATUS_LABELS.customer} tones={ORDER_STATUS_TONES} />
        }
      />

      <section aria-labelledby="order-payment" className="space-y-2">
        <h2 id="order-payment" className="text-lg font-semibold">
          {COPY.paymentHeading}
        </h2>
        <p className="text-sm">
          {PAYMENT_METHOD_LABELS[data.paymentMethod]} · {PAYMENT_STATUS_LABELS[data.paymentStatus]}
        </p>
        {data.status === 'pending_payment' && data.paymentExpiresAt !== null ? (
          <AwaitingPayment
            orderId={data.id}
            expiresAt={data.paymentExpiresAt}
            onStale={() => void order.refetch()}
          />
        ) : null}
      </section>

      <section aria-labelledby="order-address" className="space-y-1 text-sm">
        <h2 id="order-address" className="text-lg font-semibold">
          {COPY.addressHeading}
        </h2>
        <p>
          {address.recipientName} · {address.recipientPhone}
        </p>
        <p className="text-muted-foreground">{lines.main}</p>
        {lines.extra === null ? null : <p className="text-muted-foreground">{lines.extra}</p>}
      </section>

      {data.sellerOrders.map((sellerOrder) => (
        <SellerOrderBlock
          key={sellerOrder.id}
          order={data}
          sellerOrder={sellerOrder}
          onStale={() => void order.refetch()}
        />
      ))}

      <section aria-label={COPY.total} className="max-w-sm space-y-3">
        <OrderTotals order={data} />
        {notes.map((note) => (
          <p key={note} className="text-sm text-muted-foreground">
            {note}
          </p>
        ))}
      </section>

      {data.status === 'cancelled' ? <BuyAgain order={data} /> : null}

      <Link
        href={{ pathname: ROUTES.supportNew, query: { order: data.id } }}
        className={buttonVariants({ variant: 'outline' })}
      >
        {COPY.getHelp}
      </Link>
    </div>
  );
}

/** Countdown and Pay now until `paymentExpiresAt` (SF-18 acceptance 3: never after it). */
function AwaitingPayment({
  orderId,
  expiresAt,
  onStale,
}: {
  readonly orderId: string;
  readonly expiresAt: string;
  readonly onStale: () => void;
}) {
  const expired = usePassed(Date.parse(expiresAt));
  if (expired) return null;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {COPY.timeLeft}: <Countdown deadline={expiresAt} label={COPY.timeLeft} onExpire={onStale} />
      </p>
      <PayNow orderId={orderId} onStale={onStale} />
    </div>
  );
}

interface SellerOrderBlockProps {
  readonly order: Order;
  readonly sellerOrder: SellerOrder;
  readonly onStale: () => void;
}

function SellerOrderBlock({ order, sellerOrder, onStale }: SellerOrderBlockProps) {
  // SF-Q-18: delivered and inside the return window (no delivery time: SF-26 decides).
  const windowClosed = usePassed(returnWindowEnd(sellerOrder)?.getTime() ?? Number.POSITIVE_INFINITY);
  const offerReturn = sellerOrder.status === 'delivered' && !windowClosed;
  // Oldest first (spec 01 SF-18 §4), whatever order the API used.
  const timeline = [...sellerOrder.timeline].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  return (
    <section aria-label={COPY.soldBy(sellerOrder.businessName)} className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="font-medium">{COPY.soldBy(sellerOrder.businessName)}</h2>
        <span className="flex items-center gap-3">
          <StatusBadge
            value={sellerOrder.status}
            labels={SELLER_ORDER_STATUS_LABELS.customer}
            tones={SELLER_ORDER_STATUS_TONES}
          />
          {/* Offered exactly when the API says so (SF-18 acceptance 1). */}
          {sellerOrder.canCancel ? (
            <CancelSellerOrder order={order} sellerOrder={sellerOrder} onStale={onStale} />
          ) : null}
          {offerReturn ? (
            <Link
              href={requestReturnPath(order.id, sellerOrder.id)}
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              {COPY.returnItems}
            </Link>
          ) : null}
        </span>
      </div>
      {/* Spec 01 §10.3: why a parcel was cancelled, "Cancelled by Nile" included (§10.6 labels). */}
      {sellerOrder.status === 'cancelled' && sellerOrder.cancelReason !== null ? (
        <p className="border-b border-border px-4 py-2 text-sm text-muted-foreground">
          {SELLER_ORDER_CANCEL_REASON_LABELS.customer[sellerOrder.cancelReason]}
        </p>
      ) : null}
      <ul className="divide-y divide-border">
        {sellerOrder.items.map((item) => (
          <li key={item.id} className="flex flex-wrap gap-3 px-4 py-3 text-sm">
            <NileImage
              image={item.image}
              alt=""
              sizes="64px"
              placeholder="product"
              className="size-16 shrink-0 rounded-md bg-muted"
            />
            <span className="flex-1 space-y-0.5">
              <Link href={productHref(item.productId)} className="block font-medium hover:underline">
                {item.productName}
              </Link>
              {item.attributes.length === 0 ? null : (
                <span className="block text-muted-foreground">
                  {item.attributes.map((a) => `${a.attribute}: ${a.value}`).join(' · ')}
                </span>
              )}
              <span className="block text-muted-foreground">{COPY.sku(item.sku)}</span>
              <span className="block">
                {COPY.priceTimesQuantity(formatMoney(item.unitPrice), item.quantity)}
              </span>
              {item.cancelledQuantity > 0 ? (
                <span className="block text-muted-foreground">
                  {COPY.cancelledBySeller(item.cancelledQuantity)} ·{' '}
                  {COPY.openQuantity(item.quantity - item.cancelledQuantity)}
                </span>
              ) : null}
              {item.returnedQuantity > 0 ? (
                <span className="block text-muted-foreground">{COPY.returned(item.returnedQuantity)}</span>
              ) : null}
            </span>
            <span className="flex flex-col items-end gap-2">
              <ItemAmount item={item} />
              <WriteReviewLink
                orderItemId={item.id}
                productName={item.productName}
                enabled={sellerOrder.status === 'delivered'}
              />
            </span>
          </li>
        ))}
      </ul>
      <div className="flex justify-between border-t border-border px-4 py-3 text-sm">
        <span>{COPY.subtotal}</span>
        <Money value={sellerOrder.subtotal} />
      </div>
      {parseMoney(sellerOrder.discountAmount).isZero() ? null : (
        <div className="flex justify-between px-4 pb-3 text-sm">
          <span>{COPY.sellerShare}</span>
          <Money value={sellerOrder.discountAmount} negative />
        </div>
      )}
      {timeline.length === 0 ? null : (
        <div className="border-t border-border px-4 py-3">
          <h3 className="mb-2 text-sm font-medium">{COPY.timelineHeading}</h3>
          <ol className="space-y-1 text-sm">
            {timeline.map((entry) => (
              <li key={`${entry.status}-${entry.at}`} className="flex flex-wrap justify-between gap-2">
                <span>{SELLER_ORDER_STATUS_LABELS.customer[entry.status]}</span>
                <span className="text-muted-foreground">{formatDateTime(entry.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
