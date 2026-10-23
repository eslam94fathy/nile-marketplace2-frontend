'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { LoadMore } from '../components/load-more';
import { LoadingRegion, Skeleton } from '../components/states';
import { nextSort, parseSort, type SortDirection } from './sort';

// A server-driven table (T-C2): the API sorts and pages (cursor, no totals), so this only renders rows,
// sort headers that emit the API `sort` value, and "Load more". It never shows counts or page numbers.
// Controlled: the app keeps sort and filters in the URL (conventions §7) and passes them in.

export interface DataTableColumn<Row> {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** API sort field (e.g. `createdAt`); makes the header a sort button. Only fields the endpoint allows. */
  readonly sortField?: string;
  /** Direction of the first click on this column (default `asc`; dates usually `desc`). */
  readonly firstDirection?: SortDirection;
  /** `end` for numbers and money. */
  readonly align?: 'start' | 'end';
}

export interface DataTableProps<Row> {
  /** Accessible name of the table; visible only to screen readers unless `showCaption`. */
  readonly caption: string;
  readonly showCaption?: boolean;
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly getRowId: (row: Row) => string;
  /** Current API sort value, e.g. `-createdAt`. */
  readonly sort?: string | undefined;
  readonly onSortChange?: (sort: string) => void;
  /** First load: skeleton rows instead of an empty table. */
  readonly loading?: boolean;
  /** Shown instead of the table when there are no rows (conventions §3). */
  readonly empty: ReactNode;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly onLoadMore: () => void;
  /** Filters above the table (bound to the URL by the app). */
  readonly toolbar?: ReactNode;
  readonly className?: string;
}

const SKELETON_ROWS = 5;
const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

export function DataTable<Row>({
  caption,
  showCaption = false,
  columns,
  rows,
  getRowId,
  sort,
  onSortChange,
  loading = false,
  empty,
  hasMore,
  loadingMore,
  onLoadMore,
  toolbar,
  className,
}: DataTableProps<Row>) {
  const current = parseSort(sort);

  function header(column: DataTableColumn<Row>) {
    const sorted =
      current !== undefined && column.sortField === current.field ? current.direction : undefined;
    const alignment = column.align === 'end' ? 'text-end' : 'text-start';
    if (column.sortField === undefined || onSortChange === undefined) {
      return (
        <th key={column.id} scope="col" className={cn('px-3 py-2 font-medium', alignment)}>
          {column.header}
        </th>
      );
    }
    const field = column.sortField;
    const Icon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
    return (
      <th
        key={column.id}
        scope="col"
        aria-sort={sorted === undefined ? 'none' : ARIA_SORT[sorted]}
        className={cn('px-1 py-1 font-medium', alignment)}
      >
        <button
          type="button"
          onClick={() => {
            onSortChange(nextSort(sort, field, column.firstDirection));
          }}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted',
            column.align === 'end' && 'flex-row-reverse',
          )}
        >
          {column.header}
          <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="sr-only">
            {sorted === undefined
              ? `, ${UI_COPY.sortBy(column.header)}`
              : `, ${sorted === 'asc' ? UI_COPY.sortAscending : UI_COPY.sortDescending}`}
          </span>
        </button>
      </th>
    );
  }

  const table = (
    // Scrollable on narrow screens; focusable so keyboard users can scroll it (axe scrollable-region-focusable).
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-border"
    >
      <table className="w-full border-collapse text-sm">
        <caption className={showCaption ? 'px-3 py-2 text-start font-medium' : 'sr-only'}>{caption}</caption>
        <thead className="bg-muted text-muted-foreground">
          <tr>{columns.map(header)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowId(row)} className="border-t border-border">
              {columns.map((column) => (
                <td
                  key={column.id}
                  className={cn('px-3 py-2', column.align === 'end' && 'text-end tabular-nums')}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  let body: ReactNode;
  if (loading) {
    body = (
      <LoadingRegion className="space-y-2">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </LoadingRegion>
    );
  } else if (rows.length === 0) {
    body = empty;
  } else {
    body = (
      <>
        {table}
        <LoadMore hasMore={hasMore} loading={loadingMore} onLoadMore={onLoadMore} loadedCount={rows.length} />
      </>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {toolbar}
      {body}
    </div>
  );
}
