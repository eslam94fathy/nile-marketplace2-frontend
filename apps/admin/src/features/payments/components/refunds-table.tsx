'use client';

import {
  formatDate,
  formatDateTime,
  formatMoney,
  REFUND_METHOD_LABELS,
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
} from '@nile/domain';
import { DataTable, REFUND_STATUS_TONES, StatusBadge, type DataTableColumn } from '@nile/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useActorLabel } from '@/features/lookups';
import { orderPath, refundPath } from '@/lib/routes';
import type { Refund } from '../api';
import { PAYMENTS_COPY as COPY } from '../copy';

export interface RefundsTableProps {
  readonly caption: string;
  readonly rows: readonly Refund[];
  readonly currentUserId: string;
  readonly empty: ReactNode;
  readonly loading?: boolean;
  readonly hasMore?: boolean;
  readonly loadingMore?: boolean;
  readonly onLoadMore?: () => void;
  readonly toolbar?: ReactNode;
}

const linkClass = 'font-medium text-primary underline-offset-4 hover:underline';

/** When a refund was settled: recorded by an admin, or refunded automatically. */
function settled(row: Refund, actor: (id: string | null) => string): string {
  if (row.recordedAt !== null)
    return COPY.recordedBy(formatDateTime(row.recordedAt), actor(row.recordedByUserId));
  if (row.succeededAt !== null) return formatDateTime(row.succeededAt);
  return COPY.none;
}

/**
 * Spec 03 AD-16 rows over every status; each opens AD-34, where a refund is recorded or retried (T-M8). Also the
 * refunds blocks of AD-15 and AD-17.
 */
export function RefundsTable({
  caption,
  rows,
  currentUserId,
  empty,
  loading = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore = () => undefined,
  toolbar,
}: RefundsTableProps) {
  const actorLabel = useActorLabel(currentUserId);
  const actor = (id: string | null) => actorLabel(id, 'admin');

  const columns: readonly DataTableColumn<Refund>[] = [
    { id: 'created', header: COPY.columns.created, cell: (row) => formatDate(row.createdAt) },
    {
      id: 'order',
      header: COPY.columns.order,
      cell: (row) => (
        <Link href={orderPath(row.orderId)} className={linkClass}>
          {COPY.orderLink(row.orderId)}
        </Link>
      ),
    },
    {
      id: 'amount',
      header: COPY.columns.amount,
      align: 'end',
      // The amount opens AD-34 (T-M8).
      cell: (row) => (
        <Link href={refundPath(row.id)} className={linkClass}>
          {formatMoney(row.amount)}
        </Link>
      ),
    },
    { id: 'reason', header: COPY.columns.reason, cell: (row) => REFUND_REASON_LABELS[row.reason] },
    { id: 'method', header: COPY.columns.method, cell: (row) => REFUND_METHOD_LABELS[row.method] },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (row) => (
        <span className="flex flex-col gap-1">
          <StatusBadge value={row.status} labels={REFUND_STATUS_LABELS} tones={REFUND_STATUS_TONES} />
          {/* The API's redacted provider text (spec 10 N-2), for refunds the job handed back. */}
          {row.lastError === null ? null : <span className="text-muted-foreground">{row.lastError}</span>}
        </span>
      ),
    },
    { id: 'attempts', header: COPY.columns.attempts, align: 'end', cell: (row) => row.attemptCount },
    { id: 'settled', header: COPY.columns.settled, cell: (row) => settled(row, actor) },
  ];

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      loading={loading}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onLoadMore={onLoadMore}
      empty={empty}
      {...(toolbar === undefined ? {} : { toolbar })}
    />
  );
}
