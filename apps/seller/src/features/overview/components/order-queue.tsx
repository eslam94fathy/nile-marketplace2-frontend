'use client';

import { Countdown, ErrorState, Money } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import {
  openItemCount,
  ORDER_TAB_PARAM,
  ORDERS_COPY,
  overviewQueueQuery,
  type OverviewQueue,
} from '@/features/orders';
import { orderPath, ROUTES } from '@/lib/routes';
import { OVERVIEW_COPY as COPY } from '../copy';

const QUEUES = {
  toConfirm: { heading: COPY.toConfirmHeading, tab: 'to-confirm', seeAll: COPY.seeAllToConfirm },
  returns: { heading: COPY.returnsHeading, tab: 'returns', seeAll: COPY.seeAllReturns },
} as const;

/**
 * SE-06 items 2-3: up to 5 orders, oldest first, polled every 60 s while visible. "Orders to confirm" shows
 * the acceptance countdown and an empty text; "Returns to confirm" is hidden when empty. No counts (the API
 * has none).
 */
export function OrderQueue({ queue }: { readonly queue: OverviewQueue }) {
  const orders = useQuery(overviewQueueQuery(queue));
  const { heading, tab, seeAll } = QUEUES[queue];
  if (queue === 'returns' && (orders.data === undefined || orders.data.length === 0) && !orders.isError) {
    return null;
  }
  const headingId = `${queue}-heading`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold">
          {heading}
        </h2>
        <Link
          href={`${ROUTES.orders}?${ORDER_TAB_PARAM}=${tab}` as Route}
          aria-label={seeAll}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {COPY.seeAll}
        </Link>
      </div>
      {orders.isError ? (
        <ErrorState message={COPY.queueFailed} onRetry={() => void orders.refetch()} />
      ) : orders.data === undefined ? null : orders.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.toConfirmEmpty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {orders.data.map((order) => (
            <li
              key={order.id}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 p-3 text-sm"
            >
              <Link
                href={orderPath(order.id)}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {ORDERS_COPY.order(order.orderNumber)}
              </Link>
              <span>{ORDERS_COPY.itemCount(openItemCount(order))}</span>
              <Money value={order.subtotal} />
              {queue === 'toConfirm' && order.acceptDeadlineAt !== null ? (
                <span>
                  {COPY.confirmWithin}{' '}
                  <Countdown
                    deadline={order.acceptDeadlineAt}
                    label={COPY.confirmWithin}
                    onExpire={() => void orders.refetch()}
                  />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
