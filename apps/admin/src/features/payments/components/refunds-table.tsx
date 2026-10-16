'use client';

import {
  formatDate,
  formatDateTime,
  formatMoney,
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
} from '@nile/domain';
import { Button, DataTable, REFUND_STATUS_TONES, StatusBadge, type DataTableColumn } from '@nile/ui';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useActorLabel } from '@/features/lookups';
import { orderPath } from '@/lib/routes';
import type { Refund } from '../api';
import { PAYMENTS_COPY as COPY } from '../copy';
import { RecordRefundDialog } from './record-refund-dialog';

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

/** Spec 03 AD-16 rows with "Record refund" on those still to record; also AD-15 and AD-17. */
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
  const [recording, setRecording] = useState<Refund | null>(null);
  const actor = useActorLabel(currentUserId);

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
      id: 'sellerOrder',
      header: COPY.columns.sellerOrder,
      cell: (row) => (row.sellerOrderId === null ? COPY.none : COPY.shortId(row.sellerOrderId)),
    },
    { id: 'amount', header: COPY.columns.amount, align: 'end', cell: (row) => formatMoney(row.amount) },
    { id: 'reason', header: COPY.columns.reason, cell: (row) => REFUND_REASON_LABELS[row.reason] },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (row) => (
        <StatusBadge value={row.status} labels={REFUND_STATUS_LABELS} tones={REFUND_STATUS_TONES} />
      ),
    },
    { id: 'reference', header: COPY.columns.reference, cell: (row) => row.providerRefundRef ?? COPY.none },
    {
      id: 'recorded',
      header: COPY.columns.recorded,
      cell: (row) =>
        row.recordedAt === null
          ? COPY.none
          : COPY.recordedBy(formatDateTime(row.recordedAt), actor(row.recordedByUserId, 'admin')),
    },
    {
      id: 'actions',
      header: COPY.columns.actions,
      cell: (row) =>
        row.status === 'pending_manual' ? (
          <Button
            size="sm"
            aria-label={COPY.recordFor(formatMoney(row.amount))}
            onClick={() => {
              setRecording(row);
            }}
          >
            {COPY.record}
          </Button>
        ) : null,
    },
  ];

  return (
    <>
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
      {recording === null ? null : (
        <RecordRefundDialog
          refund={recording}
          onClose={() => {
            setRecording(null);
          }}
        />
      )}
    </>
  );
}
