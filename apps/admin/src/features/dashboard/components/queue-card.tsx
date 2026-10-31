'use client';

import type { Page } from '@nile/query';
import { ErrorState, Skeleton } from '@nile/ui';
import { queryOptions, useQuery, type QueryKey } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DASHBOARD_COPY as COPY } from '../copy';

// AD-02 work-queue cards (spec 03, AD-Q-1). Each later task adds its queue (decided 2026-10-15): a query made
// with `dashboardQueueOptions` and a `QueueCard` in `DASHBOARD_QUEUES`.

/** Each card shows at most 5 rows (spec 03 AD-02). */
export const DASHBOARD_QUEUE_SIZE = 5;

/**
 * A queue's query: one page of `DASHBOARD_QUEUE_SIZE`. `fetchPage` passes the limit to the API. No timed polling
 * (spec 03 §7.5, AD-Q-16): cards are read on every visit, on focus, and again on a live message where one exists.
 */
export function dashboardQueueOptions<T>(
  queryKey: QueryKey,
  fetchPage: (limit: number, signal: AbortSignal) => Promise<Page<T>>,
) {
  return queryOptions({
    queryKey,
    queryFn: ({ signal }) => fetchPage(DASHBOARD_QUEUE_SIZE, signal),
  });
}

export interface QueueCardProps<T> {
  readonly title: string;
  /** Where "See all" goes (the queue's full screen, filtered). */
  readonly seeAllHref: Route;
  /** Accessible name of "See all", e.g. "See all sellers waiting for approval". */
  readonly seeAllLabel: string;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly page: Page<T> | undefined;
  readonly getRowId: (row: T) => string;
  readonly renderRow: (row: T) => ReactNode;
}

/** Up to 5 rows, "More…" when the API has more (no counts exist), "Nothing waiting." when empty. */
export function QueueCard<T>({
  title,
  seeAllHref,
  seeAllLabel,
  isError,
  onRetry,
  page,
  getRowId,
  renderRow,
}: QueueCardProps<T>) {
  const headingId = `queue-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  let body: ReactNode;
  if (isError) body = <ErrorState message={COPY.failed} onRetry={onRetry} />;
  else if (page === undefined) body = <Skeleton className="h-24" />;
  else if (page.data.length === 0)
    body = <p className="text-sm text-muted-foreground">{COPY.nothingWaiting}</p>;
  else {
    body = (
      <>
        <ul className="divide-y divide-border text-sm">
          {page.data.slice(0, DASHBOARD_QUEUE_SIZE).map((row) => (
            <li key={getRowId(row)} className="py-2">
              {renderRow(row)}
            </li>
          ))}
        </ul>
        {page.meta.hasMore ? <p className="text-sm text-muted-foreground">{COPY.more}</p> : null}
      </>
    );
  }
  return (
    <section aria-labelledby={headingId} className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={headingId} className="font-semibold">
          {title}
        </h2>
        <Link
          href={seeAllHref}
          aria-label={seeAllLabel}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {COPY.seeAll}
        </Link>
      </div>
      {body}
    </section>
  );
}

/** Convenience for a queue component: its query plus the card. */
export function useQueueCard<T>(options: ReturnType<typeof dashboardQueueOptions<T>>) {
  const query = useQuery(options);
  return { isError: query.isError, onRetry: () => void query.refetch(), page: query.data };
}
