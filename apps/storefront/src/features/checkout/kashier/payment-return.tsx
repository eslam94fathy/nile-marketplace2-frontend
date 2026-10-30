'use client';

import { isApiError } from '@nile/api';
import { useRealtimeConnected } from '@nile/realtime';
import { buttonVariants, Countdown, ErrorState, PageHeader, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  BuyAgain,
  clearPendingPaymentOrder,
  isOrderMissing,
  latestOpenOrderQuery,
  orderQuery,
  PayNow,
  readPendingPaymentOrder,
  type Order,
} from '@/features/orders';
import { orderPath, ROUTES } from '@/lib/routes';
import { OrderSummaryBlocks } from '../components/order-summary';
import { CHECKOUT_COPY } from '../copy';
import {
  PAYMENT_CONFIRMATION_GRACE_MS,
  PAYMENT_RETURN_ORDER_MAX_AGE_MS,
  PAYMENT_RETURN_POLL_MS,
  PAYMENT_RETURN_SOCKET_WAIT_MS,
} from '../lib/constants';
import { usePassed } from '@/lib/use-passed';

const COPY = CHECKOUT_COPY.kashier;

const noSubscription = () => () => undefined;

/**
 * Polling stops once the order is final, and at the grace limit after the payment window. With a socket the
 * page first waits for `payment.updated` (spec 01 SF-09, RT-4): `waiting` is true for those first 30 s.
 */
function pollInterval(order: Order | undefined, waiting: boolean): number | false {
  if (order?.status !== 'pending_payment' || waiting) return false;
  const deadline = order.paymentExpiresAt === null ? Number.NaN : Date.parse(order.paymentExpiresAt);
  return Date.now() > deadline + PAYMENT_CONFIRMATION_GRACE_MS ? false : PAYMENT_RETURN_POLL_MS;
}

function Screen({ children, busy = false }: { readonly children: ReactNode; readonly busy?: boolean }) {
  return (
    <div className="space-y-6" aria-busy={busy || undefined}>
      <PageHeader title={COPY.returnTitle} />
      {children}
    </div>
  );
}

const loading = (
  <Screen busy>
    <Skeleton className="h-24" />
  </Screen>
);

function NotFound() {
  return (
    <Screen>
      <p>{COPY.notFound}</p>
      <Link href={ROUTES.orders} className={buttonVariants({ variant: 'outline' })}>
        {COPY.yourOrders}
      </Link>
    </Screen>
  );
}

/**
 * SF-09 Kashier payment return. The outcome comes only from `GET /orders/{id}`: every query parameter of the
 * redirect is ignored, because the webhook is authoritative [SPEC 09 OR-11].
 */
export function PaymentReturn() {
  // undefined while rendering on the server (no sessionStorage there), then the stored id or null.
  const stored = useSyncExternalStore(noSubscription, readPendingPaymentOrder, () => undefined);
  const latest = useQuery({
    ...latestOpenOrderQuery(),
    enabled: stored === null,
    select: (order) =>
      order !== null && Date.now() - Date.parse(order.createdAt) <= PAYMENT_RETURN_ORDER_MAX_AGE_MS
        ? order.id
        : null,
  });

  if (stored === undefined) return loading;
  if (stored !== null) return <OrderOutcome orderId={stored} />;
  if (latest.isError) {
    return (
      <Screen>
        <ErrorState message={COPY.loadFailed} onRetry={() => void latest.refetch()} />
      </Screen>
    );
  }
  if (latest.data === undefined) return loading;
  if (latest.data === null) return <NotFound />;
  return <OrderOutcome orderId={latest.data} />;
}

function OrderOutcome({ orderId }: { readonly orderId: string }) {
  const live = useRealtimeConnected();
  const [openedAt] = useState(() => Date.now());
  const socketWaitOver = usePassed(openedAt + PAYMENT_RETURN_SOCKET_WAIT_MS);
  const order = useQuery({
    ...orderQuery(orderId),
    refetchInterval: (query) => pollInterval(query.state.data, live && !socketWaitOver),
  });
  const data = order.data;
  const final = data !== undefined && data.status !== 'pending_payment';

  useEffect(() => {
    if (final) clearPendingPaymentOrder();
  }, [final]);

  if (order.isError) {
    if (isOrderMissing(order.error)) return <NotFound />;
    return (
      <Screen>
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void order.refetch()}
          correlationId={isApiError(order.error) ? (order.error.correlationId ?? undefined) : undefined}
        />
      </Screen>
    );
  }
  if (data === undefined) return loading;
  if (data.status === 'pending_payment')
    return <AwaitingConfirmation order={data} onStale={() => void order.refetch()} />;
  if (data.status === 'cancelled') {
    return (
      <Screen>
        <p className="text-lg font-medium">{COPY.cancelled}</p>
        <div className="flex flex-wrap gap-3">
          <BuyAgain order={data} />
          <Link href={ROUTES.home} className={buttonVariants({ variant: 'outline' })}>
            {CHECKOUT_COPY.confirmation.continueShopping}
          </Link>
        </div>
      </Screen>
    );
  }
  return (
    <Screen>
      <p className="text-lg font-medium">{COPY.paid(data.orderNumber)}</p>
      <OrderSummaryBlocks order={data} />
      <Link href={orderPath(data.id)} className={buttonVariants()}>
        {CHECKOUT_COPY.confirmation.viewOrder}
      </Link>
    </Screen>
  );
}

function AwaitingConfirmation({ order, onStale }: { readonly order: Order; readonly onStale: () => void }) {
  const deadline = order.paymentExpiresAt === null ? Number.NaN : Date.parse(order.paymentExpiresAt);
  const expired = usePassed(deadline);
  const gaveUp = usePassed(deadline + PAYMENT_CONFIRMATION_GRACE_MS);

  if (gaveUp || Number.isNaN(deadline)) {
    return (
      <Screen>
        <p>{COPY.stillWaiting}</p>
        <Link href={orderPath(order.id)} className={buttonVariants({ variant: 'outline' })}>
          {COPY.goToOrder}
        </Link>
      </Screen>
    );
  }
  return (
    <Screen>
      <p className="text-lg font-medium" role="status">
        {COPY.confirming}
      </p>
      {expired || order.paymentExpiresAt === null ? null : (
        <div className="space-y-3">
          <p className="text-sm">
            {COPY.timeLeft}:{' '}
            <Countdown deadline={order.paymentExpiresAt} label={COPY.timeLeft} onExpire={onStale} />
          </p>
          <PayNow orderId={order.id} onStale={onStale} />
        </div>
      )}
    </Screen>
  );
}
