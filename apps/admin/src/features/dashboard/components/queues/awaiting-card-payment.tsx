'use client';

import { unwrap } from '@nile/api';
import { formatDate, formatMoney } from '@nile/domain';
import Link from 'next/link';
import { ORDERS_COPY, orderKeys } from '@/features/orders';
import { browserApi } from '@/lib/browser-api';
import { orderPath, ROUTES } from '@/lib/routes';
import { dashboardQueueOptions, QueueCard, useQueueCard } from '../queue-card';

/** The AD-14 tab of orders awaiting payment (spec 01 SF-17 group). */
const AWAITING_PAYMENT_HREF = `${ROUTES.orders}?status=awaiting-payment` as const;

/** AD-02 queue 5 (T-H10): orders awaiting card payment, oldest first → AD-15. */
export function AwaitingCardPaymentQueue() {
  const card = useQueueCard(
    dashboardQueueOptions(orderKeys.dashboard(), (limit, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/orders', {
          params: { query: { limit, sort: 'createdAt', 'status[eq]': 'pending_payment' } },
          signal,
        }),
      ),
    ),
  );
  return (
    <QueueCard
      title={ORDERS_COPY.queueTitle}
      seeAllHref={AWAITING_PAYMENT_HREF}
      seeAllLabel={ORDERS_COPY.queueSeeAll}
      getRowId={(order) => order.id}
      renderRow={(order) => (
        <span className="flex flex-wrap justify-between gap-2">
          <Link
            href={orderPath(order.id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {ORDERS_COPY.orderNumber(order.orderNumber)}
          </Link>
          <span className="text-muted-foreground">
            {ORDERS_COPY.queueRow(formatMoney(order.total), formatDate(order.createdAt))}
          </span>
        </span>
      )}
      {...card}
    />
  );
}
