'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, formatMoney, isCalendarDay, SHIPMENT_STATUS_LABELS } from '@nile/domain';
import {
  buttonVariants,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadMore,
  PageHeader,
  SHIPMENT_STATUS_TONES,
  Skeleton,
  StatusBadge,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { InactiveGate, useInactiveOnError } from '@/features/profile';
import { ROUTES, shipmentPath } from '@/lib/routes';
import { historyOptions, type AgentShipment, type HistoryRange } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';

export type RawHistoryParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);

/** `?from=&to=` (Cairo days); invalid values dropped, an end before the start dropped (R-28). */
export function parseHistoryRange(params: RawHistoryParams): HistoryRange {
  const from = day(single(params.from));
  const to = day(single(params.to));
  return { from, to: from !== null && to !== null && to < from ? null : to };
}

const historyHref = (range: HistoryRange): Route => {
  const query = new URLSearchParams();
  if (range.from !== null) query.set('from', range.from);
  if (range.to !== null) query.set('to', range.to);
  const text = query.toString();
  return text === '' ? ROUTES.history : `${ROUTES.history}?${text}`;
};

/** AG-06 History: delivered, returned and cancelled shipments, newest first; tap → AG-05 read-only. */
export function History({ params }: { readonly params: RawHistoryParams }) {
  const range = parseHistoryRange(params);
  return (
    <div className="space-y-4">
      <PageHeader title={COPY.historyTitle} />
      <InactiveGate>
        <HistoryList range={range} />
      </InactiveGate>
    </div>
  );
}

function HistoryList({ range }: { readonly range: HistoryRange }) {
  const id = useId();
  const router = useRouter();
  const history = useInfiniteQuery(historyOptions(range));
  useInactiveOnError(history.error);
  const rows = history.data?.pages.flatMap((page) => page.data) ?? [];
  const narrowed = range.from !== null || range.to !== null;

  let body;
  if (history.isError) {
    body = (
      <ErrorState
        message={COPY.historyFailed}
        onRetry={() => void history.refetch()}
        correlationId={isApiError(history.error) ? (history.error.correlationId ?? undefined) : undefined}
      />
    );
  } else if (history.isPending) {
    body = <Skeleton className="h-40" />;
  } else if (rows.length === 0) {
    body = narrowed ? (
      <EmptyState
        title={COPY.historyEmptyFiltered}
        action={
          <Link href={ROUTES.history} className={buttonVariants({ variant: 'outline' })}>
            {COPY.clearDates}
          </Link>
        }
      />
    ) : (
      <EmptyState title={COPY.historyEmpty} />
    );
  } else {
    body = (
      <div className="space-y-3">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((shipment) => (
            <li key={shipment.id}>
              <HistoryRow shipment={shipment} />
            </li>
          ))}
        </ul>
        <LoadMore
          hasMore={history.hasNextPage}
          loading={history.isFetchingNextPage}
          onLoadMore={() => void history.fetchNextPage()}
          loadedCount={rows.length}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-from`}>{COPY.from}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            className="h-12"
            value={range.from ?? ''}
            max={range.to ?? undefined}
            onChange={(event) => {
              router.replace(
                historyHref({ ...range, from: event.target.value === '' ? null : event.target.value }),
              );
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-to`}>{COPY.to}</Label>
          <Input
            id={`${id}-to`}
            type="date"
            className="h-12"
            value={range.to ?? ''}
            min={range.from ?? undefined}
            onChange={(event) => {
              router.replace(
                historyHref({ ...range, to: event.target.value === '' ? null : event.target.value }),
              );
            }}
          />
        </div>
      </div>
      {body}
    </div>
  );
}

function HistoryRow({ shipment }: { readonly shipment: AgentShipment }) {
  const collected =
    shipment.paymentMethod === 'kashier'
      ? COPY.prepaidShort
      : shipment.status === 'delivered'
        ? COPY.collected(formatMoney(shipment.amountToCollect))
        : null;
  return (
    <Link href={shipmentPath(shipment.id)} className="block space-y-1 p-4 hover:bg-muted">
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{COPY.orderNumber(shipment.orderNumber)}</span>
        <StatusBadge
          value={shipment.status}
          labels={SHIPMENT_STATUS_LABELS.agent}
          tones={SHIPMENT_STATUS_TONES}
        />
      </span>
      <span className="block text-sm text-muted-foreground">
        {shipment.dropoff.area}, {shipment.dropoff.city}
      </span>
      <span className="flex flex-wrap justify-between gap-2 text-sm">
        {collected === null ? null : <span className="font-medium">{collected}</span>}
        {shipment.deliveredAt === null ? null : (
          <span className="text-muted-foreground">
            {COPY.deliveredOn(formatDateTime(shipment.deliveredAt))}
          </span>
        )}
      </span>
    </Link>
  );
}
