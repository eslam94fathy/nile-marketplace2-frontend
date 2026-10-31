'use client';

import { formatDateTime } from '@nile/domain';
import { Countdown, ErrorState, Money } from '@nile/ui';
import { useRealtimeConnected } from '@nile/realtime';
import { useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { returnPath, ROUTES } from '@/lib/routes';
import { returnQueueQuery, type ReturnQueue as Queue } from '../api';
import { RETURNS_COPY as COPY } from '../copy';
import { RETURN_TAB_PARAM, returnedUnits } from '../lib/tabs';

const QUEUES = {
  toDecide: { heading: COPY.toDecideHeading, tab: 'to-decide', seeAll: COPY.seeAllToDecide },
  toCheck: { heading: COPY.toCheckHeading, tab: 'to-check', seeAll: COPY.seeAllToCheck },
} as const;

/**
 * SE-06 (SE-Q-11): up to 5 returns to decide (nearest deadline first, with the countdown) and 5 to check
 * ("Check the returned items by {deadline}"). Hidden when empty, like the order returns queue; polled every
 * 60 s only without a socket.
 */
export function ReturnQueue({ queue }: { readonly queue: Queue }) {
  const live = useRealtimeConnected();
  const returns = useQuery(returnQueueQuery(queue, live));
  if ((returns.data === undefined || returns.data.length === 0) && !returns.isError) return null;
  const { heading, tab, seeAll } = QUEUES[queue];
  const headingId = `returns-${queue}-heading`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-lg font-semibold">
          {heading}
        </h2>
        <Link
          href={`${ROUTES.returns}?${RETURN_TAB_PARAM}=${tab}` as Route}
          aria-label={seeAll}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {COPY.seeAll}
        </Link>
      </div>
      {returns.isError ? (
        <ErrorState message={COPY.queueFailed} onRetry={() => void returns.refetch()} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {returns.data.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 p-3 text-sm"
            >
              <Link
                href={returnPath(item.id)}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {COPY.returnNumber(item.returnNumber)}
              </Link>
              <span>{COPY.itemCount(returnedUnits(item))}</span>
              <Money value={item.refundAmount} />
              {queue === 'toDecide' && item.sellerDecisionDeadlineAt !== null ? (
                <span>
                  {COPY.decideWithin}{' '}
                  <Countdown
                    deadline={item.sellerDecisionDeadlineAt}
                    label={COPY.decideWithin}
                    onExpire={() => void returns.refetch()}
                  />
                </span>
              ) : null}
              {queue === 'toCheck' && item.inspectionDeadlineAt !== null ? (
                <span>{COPY.checkBy(formatDateTime(item.inspectionDeadlineAt))}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
