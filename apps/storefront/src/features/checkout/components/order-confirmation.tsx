'use client';

import { isApiError } from '@nile/api';
import { formatMoney, ORDER_STATUS_LABELS, SELLER_ORDER_STATUS_LABELS } from '@nile/domain';
import { buttonVariants, ErrorState, Money, NotFoundScreen, PageHeader, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { addressLines } from '@/features/addresses';
import { orderQuery } from '@/features/orders';
import { orderPath, ROUTES } from '@/lib/routes';
import { CHECKOUT_COPY } from '../copy';

const COPY = CHECKOUT_COPY.confirmation;

/** Statuses for which the confirmation still reads "is placed" (spec 01 SF-08). */
const JUST_PLACED = new Set(['placed', 'in_progress']);

/** SF-08 Order confirmation (COD): only data from `GET /orders/{orderId}`. */
export function OrderConfirmation({ orderId }: { readonly orderId: string }) {
  const order = useQuery(orderQuery(orderId));

  if (order.isError) {
    if (isApiError(order.error, 'ORDER_NOT_FOUND')) {
      return (
        <NotFoundScreen
          homeLink={
            <Link href={ROUTES.home} className={buttonVariants({ variant: 'outline' })}>
              {COPY.continueShopping}
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
        <PageHeader title={COPY.title} />
        <Skeleton className="h-24" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const data = order.data;
  const address = data.shippingAddress;
  const lines = addressLines(address, address.governorateName);
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <div className="space-y-2">
        <p className="text-lg font-medium">
          {JUST_PLACED.has(data.status)
            ? COPY.thanks(data.orderNumber)
            : COPY.status(data.orderNumber, ORDER_STATUS_LABELS.customer[data.status])}
        </p>
        {data.paymentMethod === 'cod' ? <p>{COPY.payCod(formatMoney(data.total))}</p> : null}
      </div>
      {data.sellerOrders.map((sellerOrder) => (
        <section
          key={sellerOrder.id}
          aria-label={CHECKOUT_COPY.soldBy(sellerOrder.businessName)}
          className="rounded-lg border border-border"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
            <h2 className="text-sm font-medium">{CHECKOUT_COPY.soldBy(sellerOrder.businessName)}</h2>
            <span className="text-sm text-muted-foreground">
              {SELLER_ORDER_STATUS_LABELS.customer[sellerOrder.status]}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {sellerOrder.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-4 px-4 py-3 text-sm">
                <span>
                  <span className="block font-medium">{item.productName}</span>
                  {item.attributes.length === 0 ? null : (
                    <span className="block text-muted-foreground">
                      {item.attributes.map((a) => `${a.attribute}: ${a.value}`).join(' · ')}
                    </span>
                  )}
                  <span className="block text-muted-foreground">{CHECKOUT_COPY.quantity(item.quantity)}</span>
                </span>
                <Money value={item.lineTotal} />
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="confirmation-address" className="space-y-1 text-sm">
        <h2 id="confirmation-address" className="font-medium">
          {COPY.addressHeading}
        </h2>
        <p>
          {address.recipientName} · {address.recipientPhone}
        </p>
        <p className="text-muted-foreground">{lines.main}</p>
        {lines.extra === null ? null : <p className="text-muted-foreground">{lines.extra}</p>}
      </section>
      <div className="flex flex-wrap gap-3">
        <Link href={orderPath(data.id)} className={buttonVariants()}>
          {COPY.viewOrder}
        </Link>
        <Link href={ROUTES.home} className={buttonVariants({ variant: 'outline' })}>
          {COPY.continueShopping}
        </Link>
      </div>
    </div>
  );
}
