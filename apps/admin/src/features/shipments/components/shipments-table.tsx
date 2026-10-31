'use client';

import {
  formatDate,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  SHIPMENT_KIND_LABELS,
  SHIPMENT_STATUS_LABELS,
} from '@nile/domain';
import type { Page } from '@nile/query';
import { DataTable, SHIPMENT_STATUS_TONES, StatusBadge, type DataTableColumn } from '@nile/ui';
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAgentNames, useGovernorateName } from '@/features/lookups';
import { agentPath, returnPath, shipmentPath } from '@/lib/routes';
import type { AdminShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';

export interface ShipmentsTableProps {
  readonly caption: string;
  readonly query: UseInfiniteQueryResult<InfiniteData<Page<AdminShipment>>>;
  readonly empty: ReactNode;
  readonly toolbar?: ReactNode;
}

const linkClass = 'font-medium text-primary underline-offset-4 hover:underline';

/** Spec 03 AD-12 rows; also AD-11's active shipments. Agent names are read per unique id (AD-Q-3). */
export function ShipmentsTable({ caption, query, empty, toolbar }: ShipmentsTableProps) {
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const agentName = useAgentNames(rows.map((row) => row.agentId));
  const governorates = useGovernorateName();
  const Seller = ({ row }: { readonly row: AdminShipment }) => (
    <span className="flex flex-col">
      <span>{row.pickup.businessName}</span>
      <span className="text-muted-foreground">{governorates.name(row.pickup.governorateId)}</span>
    </span>
  );

  const columns: readonly DataTableColumn<AdminShipment>[] = [
    {
      id: 'order',
      header: COPY.columns.order,
      cell: (row) => (
        <span className="flex flex-col">
          <Link href={shipmentPath(row.id)} className={linkClass}>
            {COPY.orderNumber(row.orderNumber)}
          </Link>
          {row.returnId === null ? null : (
            <Link href={returnPath(row.returnId)} className="text-primary underline-offset-4 hover:underline">
              {COPY.returnLink(row.returnId)}
            </Link>
          )}
        </span>
      ),
    },
    { id: 'kind', header: COPY.columns.kind, cell: (row) => SHIPMENT_KIND_LABELS.admin[row.kind] },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (row) => (
        <StatusBadge value={row.status} labels={SHIPMENT_STATUS_LABELS.admin} tones={SHIPMENT_STATUS_TONES} />
      ),
    },
    { id: 'payment', header: COPY.columns.payment, cell: (row) => PAYMENT_METHOD_LABELS[row.paymentMethod] },
    {
      id: 'pickup',
      header: COPY.columns.pickup,
      // A return is collected at the customer and handed to the seller (SPEC 11 DE-26): the columns follow the trip.
      cell: (row) => (row.kind === 'return' ? row.dropoff.governorateName : <Seller row={row} />),
    },
    {
      id: 'dropoff',
      header: COPY.columns.dropoff,
      cell: (row) => (row.kind === 'return' ? <Seller row={row} /> : row.dropoff.governorateName),
    },
    {
      id: 'agent',
      header: COPY.columns.agent,
      cell: (row) =>
        row.agentId === null ? (
          <span className="text-muted-foreground">{COPY.unassigned}</span>
        ) : (
          <Link href={agentPath(row.agentId)} className={linkClass}>
            {agentName(row.agentId) ?? COPY.shortId(row.agentId)}
          </Link>
        ),
    },
    { id: 'attempts', header: COPY.columns.attempts, align: 'end', cell: (row) => row.attemptCount },
    {
      id: 'toCollect',
      header: COPY.columns.toCollect,
      align: 'end',
      cell: (row) => formatMoney(row.amountToCollect),
    },
    { id: 'created', header: COPY.columns.created, cell: (row) => formatDate(row.createdAt) },
  ];

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      loading={query.isPending}
      hasMore={query.hasNextPage}
      loadingMore={query.isFetchingNextPage}
      onLoadMore={() => void query.fetchNextPage()}
      empty={empty}
      {...(toolbar === undefined ? {} : { toolbar })}
    />
  );
}
