'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, STOCK_MOVEMENT_TYPE_LABELS } from '@nile/domain';
import { DataTable, EmptyState, ErrorState, type DataTableColumn } from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { movementsListOptions, type StockMovement } from '../api';
import { STOCK_COPY as COPY } from '../copy';

/** Order-related movements point at an order line, not a seller order: named, not linked [VERIFIED]. */
const ORDER_ITEM_REFERENCE = 'order_item';

/** `+5`, `-3`, `0`: the change in sellable stock as the API sends it [SPEC 07 IN-6]. */
export const signed = (value: number): string => (value > 0 ? `+${value}` : String(value));

const COLUMNS: readonly DataTableColumn<StockMovement>[] = [
  { id: 'date', header: COPY.columns.date, cell: (row) => formatDateTime(row.createdAt) },
  { id: 'type', header: COPY.columns.type, cell: (row) => STOCK_MOVEMENT_TYPE_LABELS[row.type] },
  { id: 'change', header: COPY.columns.change, align: 'end', cell: (row) => signed(row.quantityDelta) },
  { id: 'onHand', header: COPY.columns.onHand, align: 'end', cell: (row) => row.onHandAfter },
  { id: 'reserved', header: COPY.columns.reserved, align: 'end', cell: (row) => row.reservedAfter },
  {
    id: 'reference',
    header: COPY.columns.reference,
    cell: (row) => (row.referenceType === ORDER_ITEM_REFERENCE ? COPY.orderItem : null),
  },
];

/** SE-13 Stock history: newest first, "Load more". The caller gives the page header. */
export function StockHistory({ variantId }: { readonly variantId: string }) {
  const movements = useInfiniteQuery(movementsListOptions(variantId));
  if (movements.isError) {
    return (
      <ErrorState
        message={COPY.historyFailed}
        onRetry={() => void movements.refetch()}
        correlationId={isApiError(movements.error) ? (movements.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{COPY.historyNote}</p>
      <DataTable
        caption={COPY.caption}
        columns={COLUMNS}
        rows={movements.data?.pages.flatMap((page) => page.data) ?? []}
        getRowId={(row) => row.id}
        loading={movements.isPending}
        empty={<EmptyState title={COPY.empty} />}
        hasMore={movements.hasNextPage}
        loadingMore={movements.isFetchingNextPage}
        onLoadMore={() => void movements.fetchNextPage()}
      />
    </div>
  );
}
