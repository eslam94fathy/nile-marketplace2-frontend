'use client';

import { isApiError } from '@nile/api';
import {
  formatDateTime,
  formatMoney,
  isCalendarDay,
  SHIPMENT_KIND_LABELS,
  SHIPMENT_KINDS,
  type ShipmentKind,
} from '@nile/domain';
import {
  Badge,
  buttonVariants,
  cn,
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
import { historyOptions, type AgentShipment, type HistoryFilters } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import { isReturnPickup, statusLabelsOf } from '../lib/kind';
import { HISTORY_KIND_PARAM } from '../lib/tabs';

export type RawHistoryParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);

/**
 * `?from=&to=&kind=` (Cairo days, `delivery` | `return`); invalid values dropped, an end before the start
 * dropped (R-28).
 */
export function parseHistoryFilters(params: RawHistoryParams): HistoryFilters {
  const from = day(single(params.from));
  const to = day(single(params.to));
  const kind = single(params[HISTORY_KIND_PARAM]);
  return {
    from,
    to: from !== null && to !== null && to < from ? null : to,
    kind: SHIPMENT_KINDS.find((value) => value === kind) ?? null,
  };
}

const historyHref = (range: HistoryFilters): Route => {
  const query = new URLSearchParams();
  if (range.from !== null) query.set('from', range.from);
  if (range.to !== null) query.set('to', range.to);
  if (range.kind !== null) query.set(HISTORY_KIND_PARAM, range.kind);
  const text = query.toString();
  return text === '' ? ROUTES.history : `${ROUTES.history}?${text}`;
};

const KIND_CHIPS: readonly { readonly kind: ShipmentKind | null; readonly label: string }[] = [
  { kind: null, label: COPY.kinds.all },
  { kind: 'delivery', label: COPY.kinds.delivery },
  { kind: 'return', label: COPY.kinds.return },
];

/**
 * AG-06 History: delivered, returned and cancelled shipments, newest first, deliveries and return pickups with kind
 * chips (spec 04 §7.3); tap → AG-05 read-only.
 */
export function History({ params }: { readonly params: RawHistoryParams }) {
  const range = parseHistoryFilters(params);
  return (
    <div className="space-y-4">
      <PageHeader title={COPY.historyTitle} />
      <InactiveGate>
        <HistoryList range={range} />
      </InactiveGate>
    </div>
  );
}

function HistoryList({ range }: { readonly range: HistoryFilters }) {
  const id = useId();
  const router = useRouter();
  const history = useInfiniteQuery(historyOptions(range));
  useInactiveOnError(history.error);
  const rows = history.data?.pages.flatMap((page) => page.data) ?? [];
  const narrowedByDates = range.from !== null || range.to !== null;

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
    let empty = <EmptyState title={COPY.historyEmpty} />;
    if (narrowedByDates) {
      empty = (
        <EmptyState
          title={COPY.historyEmptyFiltered}
          action={
            <Link
              href={historyHref({ ...range, from: null, to: null })}
              className={buttonVariants({ variant: 'outline' })}
            >
              {COPY.clearDates}
            </Link>
          }
        />
      );
    } else if (range.kind !== null) {
      empty = <EmptyState title={COPY.historyEmptyKind} />;
    }
    body = empty;
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
      <nav aria-label={COPY.kindFilter}>
        <ul className="flex flex-wrap gap-2">
          {KIND_CHIPS.map((chip) => {
            const current = chip.kind === range.kind;
            return (
              <li key={chip.label}>
                <Link
                  href={historyHref({ ...range, kind: chip.kind })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline' }), 'min-h-12')}
                >
                  {chip.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
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
  const isReturn = isReturnPickup(shipment);
  let collected: string | null = null;
  // A return pickup never carries money (spec 04 §7.4).
  if (!isReturn && shipment.paymentMethod === 'kashier') collected = COPY.prepaidShort;
  else if (!isReturn && shipment.status === 'delivered') {
    collected = COPY.collected(formatMoney(shipment.amountToCollect));
  }
  return (
    <Link href={shipmentPath(shipment.id)} className="block space-y-1 p-4 hover:bg-muted">
      <span className="flex items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{COPY.orderNumber(shipment.orderNumber)}</span>
          {isReturn ? <Badge tone="info">{SHIPMENT_KIND_LABELS.agent.return}</Badge> : null}
        </span>
        <StatusBadge
          value={shipment.status}
          labels={statusLabelsOf(shipment)}
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
            {(isReturn ? COPY.handedOn : COPY.deliveredOn)(formatDateTime(shipment.deliveredAt))}
          </span>
        )}
      </span>
    </Link>
  );
}
