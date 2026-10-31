'use client';

import { isApiError } from '@nile/api';
import { RETURN_REASON_LABELS, RETURN_STATUS_LABELS } from '@nile/domain';
import {
  buttonVariants,
  cn,
  Countdown,
  DataTable,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  RETURN_STATUS_TONES,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { orderPath, returnPath, ROUTES } from '@/lib/routes';
import { returnsListOptions, type SellerReturn } from '../api';
import { RETURNS_COPY as COPY } from '../copy';
import { RETURN_TAB_PARAM, RETURN_TABS, returnedUnits, returnTab, type ReturnTabKey } from '../lib/tabs';

const LINK = 'font-medium text-primary underline-offset-4 hover:underline';

const tabHref = (key: ReturnTabKey): Route =>
  key === RETURN_TABS[0].key ? ROUTES.returns : `${ROUTES.returns}?${RETURN_TAB_PARAM}=${key}`;

/** The deadline the tab works against: the decision for "To decide", the inspection for "To check". */
function tabDeadline(tab: ReturnTabKey, item: SellerReturn): { at: string; label: string } | null {
  if (tab === 'to-decide' && item.sellerDecisionDeadlineAt !== null) {
    return { at: item.sellerDecisionDeadlineAt, label: COPY.timeToDecide };
  }
  if (tab === 'to-check' && item.inspectionDeadlineAt !== null) {
    return { at: item.inspectionDeadlineAt, label: COPY.timeToCheck };
  }
  return null;
}

/** SE-18 Returns: tabs in the URL (`?tab=`, default "To decide"); live on `return.updated`. */
export function ReturnsList({ tab: tabParam }: { readonly tab: string | null }) {
  const tab = returnTab(tabParam);
  const returns = useInfiniteQuery(returnsListOptions(tab));
  const rows = returns.data?.pages.flatMap((page) => page.data) ?? [];
  const withDeadline = tab.key === 'to-decide' || tab.key === 'to-check';

  const columns: DataTableColumn<SellerReturn>[] = [
    {
      id: 'return',
      header: COPY.columns.return,
      cell: (item) => (
        <Link href={returnPath(item.id)} className={LINK}>
          {COPY.returnNumber(item.returnNumber)}
        </Link>
      ),
    },
    {
      id: 'order',
      header: COPY.columns.order,
      cell: (item) => (
        <Link href={orderPath(item.sellerOrderId)} className={LINK}>
          {COPY.orderNumber(item.orderNumber)}
        </Link>
      ),
    },
    { id: 'reason', header: COPY.columns.reason, cell: (item) => RETURN_REASON_LABELS.staff[item.reason] },
    {
      id: 'items',
      header: COPY.columns.items,
      align: 'end',
      cell: (item) => COPY.itemCount(returnedUnits(item)),
    },
    {
      id: 'refund',
      header: COPY.columns.refund,
      align: 'end',
      cell: (item) => <Money value={item.refundAmount} />,
    },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (item) => (
        <StatusBadge value={item.status} labels={RETURN_STATUS_LABELS.seller} tones={RETURN_STATUS_TONES} />
      ),
    },
    ...(withDeadline
      ? [
          {
            id: 'deadline',
            header: COPY.columns.deadline,
            cell: (item: SellerReturn) => {
              const deadline = tabDeadline(tab.key, item);
              return deadline === null ? null : (
                <Countdown
                  deadline={deadline.at}
                  label={deadline.label}
                  // The backend decides automatically after the deadline: show the new state.
                  onExpire={() => void returns.refetch()}
                />
              );
            },
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {RETURN_TABS.map((item) => {
            const current = item.key === tab.key;
            return (
              <li key={item.key}>
                <Link
                  href={tabHref(item.key)}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {COPY.tabs[item.key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {returns.isError ? (
        <ErrorState
          message={COPY.listFailed}
          onRetry={() => void returns.refetch()}
          correlationId={isApiError(returns.error) ? (returns.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={rows}
          getRowId={(item) => item.id}
          loading={returns.isPending}
          empty={<EmptyState title={COPY.empty[tab.key]} />}
          hasMore={returns.hasNextPage}
          loadingMore={returns.isFetchingNextPage}
          onLoadMore={() => void returns.fetchNextPage()}
        />
      )}
    </div>
  );
}
