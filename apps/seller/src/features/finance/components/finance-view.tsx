'use client';

import { isApiError } from '@nile/api';
import { formatDate, formatDateTime } from '@nile/domain';
import {
  buttonVariants,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  Money,
  PageHeader,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useEffect } from 'react';
import { orderPath, returnPath, ROUTES } from '@/lib/routes';
import {
  entriesListOptions,
  holdsListOptions,
  payoutsListOptions,
  type LedgerEntry,
  type Payout,
  type SellerHold,
} from '../api';
import { FINANCE_COPY as COPY } from '../copy';
import {
  FINANCE_TAB_PARAM,
  FINANCE_TABS,
  financeTab,
  SELLER_ENTRY_TYPES,
  type FinanceTab,
} from '../lib/finance-tabs';
import { BalanceCard } from './balance-card';

const tabHref = (tab: FinanceTab): Route =>
  tab === 'statement' ? ROUTES.finance : `${ROUTES.finance}?${FINANCE_TAB_PARAM}=${tab}`;

const LINK = 'text-primary underline-offset-4 hover:underline';

/** SE-16 Finance: balance, then the statement, the earnings on hold or the payouts (`?tab=`). */
export function FinanceView({ tab: tabParam }: { readonly tab: string | null }) {
  const tab = financeTab(tabParam);
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <BalanceCard variant="finance" />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {FINANCE_TABS.map((item) => (
            <li key={item}>
              <Link
                href={tabHref(item)}
                aria-current={item === tab ? 'page' : undefined}
                className={cn(buttonVariants({ variant: item === tab ? 'primary' : 'outline', size: 'sm' }))}
              >
                {COPY.tabs[item]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === 'statement' ? <Statement /> : tab === 'on-hold' ? <Holds /> : <Payouts />}
    </div>
  );
}

/** `+` for a credit (Nile owes more), `−` for a debit (a payout). */
function SignedAmount({ entry }: { readonly entry: LedgerEntry }) {
  return (
    <span className="tabular-nums">
      {entry.direction === 'credit' ? '+' : '−'}
      <Money value={entry.amount} />
    </span>
  );
}

/** Release 2 entries (spec 02 §8.6); the ones about a return link to it (SE-19). */
const PLAIN_DESCRIPTIONS: Partial<Record<LedgerEntry['entryType'], string>> = {
  seller_net_released: COPY.earningsReleased,
  seller_net_reversed: COPY.returnedItems,
  return_fee_charged: COPY.returnFee,
};

const isSellerEntry = (entry: LedgerEntry) =>
  (SELLER_ENTRY_TYPES as readonly string[]).includes(entry.entryType);

function Description({ entry }: { readonly entry: LedgerEntry }) {
  if (entry.entryType === 'seller_net_earned' && entry.referenceType === 'seller_order') {
    return (
      <Link href={orderPath(entry.referenceId)} className={LINK}>
        {COPY.earningsFromOrder}
      </Link>
    );
  }
  if (entry.entryType === 'seller_payout') {
    return (
      <Link href={tabHref('payouts')} className={LINK}>
        {COPY.payout}
      </Link>
    );
  }
  const text = PLAIN_DESCRIPTIONS[entry.entryType];
  if (text !== undefined && entry.referenceType === 'return') {
    return (
      <Link href={returnPath(entry.referenceId)} className={LINK}>
        {text}
      </Link>
    );
  }
  if (text !== undefined) return <span>{text}</span>;
  // Never on a seller account [SPEC 12 §1.2]: shown as sent, and reported (below).
  return <span>{entry.entryType}</span>;
}

const STATEMENT_COLUMNS: readonly DataTableColumn<LedgerEntry>[] = [
  { id: 'date', header: COPY.statementColumns.date, cell: (entry) => formatDateTime(entry.createdAt) },
  {
    id: 'description',
    header: COPY.statementColumns.description,
    cell: (entry) => <Description entry={entry} />,
  },
  {
    id: 'amount',
    header: COPY.statementColumns.amount,
    align: 'end',
    cell: (entry) => <SignedAmount entry={entry} />,
  },
  {
    id: 'balanceAfter',
    header: COPY.statementColumns.balanceAfter,
    align: 'end',
    cell: (entry) => <Money value={entry.balanceAfter} />,
  },
];

function Statement() {
  const entries = useInfiniteQuery(entriesListOptions());
  const rows = entries.data?.pages.flatMap((page) => page.data) ?? [];
  const unexpected = rows
    .filter((entry) => !isSellerEntry(entry))
    .map((entry) => `${entry.entryType}:${entry.id}`);
  const unexpectedKey = unexpected.join(',');

  useEffect(() => {
    if (unexpectedKey === '') return;
    // No client log sink until T-I4 (FQ-10, decided 2026-10-15): the console keeps the trace. Type and id only.
    // eslint-disable-next-line no-console -- the only client-side report available before T-I4
    console.warn('Unexpected ledger entry types on a seller statement', unexpectedKey);
  }, [unexpectedKey]);

  if (entries.isError) {
    return (
      <ErrorState
        message={COPY.statementFailed}
        onRetry={() => void entries.refetch()}
        correlationId={isApiError(entries.error) ? (entries.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  return (
    <DataTable
      caption={COPY.statementCaption}
      columns={STATEMENT_COLUMNS}
      rows={rows}
      getRowId={(entry) => entry.id}
      loading={entries.isPending}
      empty={<EmptyState title={COPY.statementEmpty} />}
      hasMore={entries.hasNextPage}
      loadingMore={entries.isFetchingNextPage}
      onLoadMore={() => void entries.fetchNextPage()}
    />
  );
}

const HOLD_COLUMNS: readonly DataTableColumn<SellerHold>[] = [
  {
    id: 'order',
    header: COPY.holdColumns.order,
    cell: (hold) => (
      <Link href={orderPath(hold.sellerOrderId)} className={LINK}>
        {hold.orderNumber}
      </Link>
    ),
  },
  {
    id: 'amount',
    header: COPY.holdColumns.amount,
    align: 'end',
    cell: (hold) => <Money value={hold.heldAmount} />,
  },
  {
    id: 'release',
    header: COPY.holdColumns.release,
    cell: (hold) => (
      <span className="space-y-1">
        <span className="block">{COPY.releasedOn(formatDate(hold.releaseAfter))}</span>
        {hold.blockedByReturn ? (
          <span className="block text-muted-foreground">{COPY.waitingForReturn}</span>
        ) : null}
      </span>
    ),
  },
];

/** SE-16 On hold: earnings within the return period, or kept by an open return past it. */
function Holds() {
  const holds = useInfiniteQuery(holdsListOptions());
  if (holds.isError) {
    return (
      <ErrorState
        message={COPY.holdsFailed}
        onRetry={() => void holds.refetch()}
        correlationId={isApiError(holds.error) ? (holds.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  return (
    <DataTable
      caption={COPY.holdsCaption}
      columns={HOLD_COLUMNS}
      rows={holds.data?.pages.flatMap((page) => page.data) ?? []}
      getRowId={(hold) => hold.sellerOrderId}
      loading={holds.isPending}
      empty={<EmptyState title={COPY.holdsEmpty} />}
      hasMore={holds.hasNextPage}
      loadingMore={holds.isFetchingNextPage}
      onLoadMore={() => void holds.fetchNextPage()}
    />
  );
}

const PAYOUT_COLUMNS: readonly DataTableColumn<Payout>[] = [
  { id: 'paidAt', header: COPY.payoutColumns.paidAt, cell: (payout) => formatDateTime(payout.paidAt) },
  {
    id: 'amount',
    header: COPY.payoutColumns.amount,
    align: 'end',
    cell: (payout) => <Money value={payout.amount} />,
  },
  { id: 'reference', header: COPY.payoutColumns.reference, cell: (payout) => payout.externalReference },
  {
    id: 'recordedAt',
    header: COPY.payoutColumns.recordedAt,
    cell: (payout) => formatDateTime(payout.createdAt),
  },
];

function Payouts() {
  const payouts = useInfiniteQuery(payoutsListOptions());
  if (payouts.isError) {
    return (
      <ErrorState
        message={COPY.payoutsFailed}
        onRetry={() => void payouts.refetch()}
        correlationId={isApiError(payouts.error) ? (payouts.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  return (
    <DataTable
      caption={COPY.payoutsCaption}
      columns={PAYOUT_COLUMNS}
      rows={payouts.data?.pages.flatMap((page) => page.data) ?? []}
      getRowId={(payout) => payout.id}
      loading={payouts.isPending}
      empty={<EmptyState title={COPY.payoutsEmpty} />}
      hasMore={payouts.hasNextPage}
      loadingMore={payouts.isFetchingNextPage}
      onLoadMore={() => void payouts.fetchNextPage()}
    />
  );
}
