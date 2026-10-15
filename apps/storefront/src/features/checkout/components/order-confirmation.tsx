'use client';

import { isApiError } from '@nile/api';
import { formatMoney, ORDER_STATUS_LABELS } from '@nile/domain';
import { buttonVariants, ErrorState, NotFoundScreen, PageHeader, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { isOrderMissing, orderQuery } from '@/features/orders';
import { orderPath, ROUTES } from '@/lib/routes';
import { CHECKOUT_COPY } from '../copy';
import { OrderSummaryBlocks } from './order-summary';

const COPY = CHECKOUT_COPY.confirmation;

/** Statuses for which the confirmation still reads "is placed" (spec 01 SF-08). */
const JUST_PLACED = new Set(['placed', 'in_progress']);

/** SF-08 Order confirmation (COD): only data from `GET /orders/{orderId}`. */
export function OrderConfirmation({ orderId }: { readonly orderId: string }) {
  const order = useQuery(orderQuery(orderId));

  if (order.isError) {
    if (isOrderMissing(order.error)) {
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
      <OrderSummaryBlocks order={data} />
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
