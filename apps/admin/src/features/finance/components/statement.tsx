'use client';

import { isApiError } from '@nile/api';
import {
  ACCOUNT_TYPE_LABELS,
  formatDate,
  formatDateTime,
  formatMoney,
  LEDGER_ENTRY_TYPE_LABELS,
  LEDGER_ENTRY_TYPES,
  LEDGER_REFERENCE_TYPE_LABELS,
} from '@nile/domain';
import {
  buttonVariants,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  NotFoundScreen,
  PageHeader,
  Skeleton,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import {
  accountPath,
  agentPayoutPath,
  agentRemittancePath,
  orderPath,
  refundPath,
  returnPath,
  ROUTES,
  sellerOrderHoldLedgerPath,
  sellerOrderLedgerPath,
  sellerPayoutPath,
} from '@/lib/routes';
import { accountQuery, entriesListOptions, isAccountMissing, type Account, type LedgerEntry } from '../api';
import { FINANCE_COPY as COPY } from '../copy';
import { entryFiltersQuery, parseEntryFilters, type EntryFilters, type RawParams } from '../lib/params';
import { ownerLabel } from './accounts-list';
import { Balance } from './balance';

const linkClass = 'text-primary underline-offset-4 hover:underline';

/**
 * Where an entry's reference is shown (spec 03 AD-19): a seller order in the reference lookup, an order on
 * AD-15, a remittance or payout on AD-20 / AD-21 filtered to this account's owner; Release 2 references: a return
 * on AD-33, a refund on AD-34, a seller order's hold (keyed by the seller order) in the reference lookup (T-M8).
 */
export function referenceHref(entry: Pick<LedgerEntry, 'referenceType' | 'referenceId'>, account: Account) {
  switch (entry.referenceType) {
    case 'seller_order':
      return sellerOrderLedgerPath(entry.referenceId);
    case 'order':
      return orderPath(entry.referenceId);
    case 'cod_remittance':
      return account.ownerId === null ? ROUTES.remittances : agentRemittancePath(account.ownerId);
    case 'payout':
      if (account.ownerId === null) return ROUTES.payouts;
      return account.accountType === 'seller_payable'
        ? sellerPayoutPath(account.ownerId)
        : agentPayoutPath(account.ownerId);
    case 'return':
      return returnPath(entry.referenceId);
    case 'refund':
      return refundPath(entry.referenceId);
    case 'seller_order_hold':
      return sellerOrderHoldLedgerPath(entry.referenceId);
  }
}

export interface StatementProps {
  readonly accountId: string;
  readonly params: RawParams;
}

/** AD-19 Account statement: the account, then its entries with type and date filters in the URL. */
export function Statement({ accountId, params }: StatementProps) {
  const account = useQuery(accountQuery(accountId));
  if (account.isError) {
    if (isAccountMissing(account.error)) {
      return (
        <NotFoundScreen
          message={COPY.accountNotFound}
          homeLink={
            <Link href={ROUTES.financeAccounts} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToAccounts}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.statementTitle} />
        <ErrorState
          message={COPY.accountFailed}
          onRetry={() => void account.refetch()}
          correlationId={isApiError(account.error) ? (account.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (account.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <StatementContent account={account.data} filters={parseEntryFilters(params)} />;
}

function StatementContent({
  account,
  filters,
}: {
  readonly account: Account;
  readonly filters: EntryFilters;
}) {
  const router = useRouter();
  const id = useId();
  const entries = useInfiniteQuery(entriesListOptions(account.id, filters));
  const href = (next: EntryFilters) => {
    const query = entryFiltersQuery(next);
    return query === '' ? accountPath(account.id) : (`${accountPath(account.id)}?${query}` as const);
  };
  const narrowed = filters.types.length > 0 || filters.from !== null || filters.to !== null;

  const columns: readonly DataTableColumn<LedgerEntry>[] = [
    { id: 'date', header: COPY.entryColumns.date, cell: (row) => formatDateTime(row.createdAt) },
    { id: 'type', header: COPY.entryColumns.type, cell: (row) => LEDGER_ENTRY_TYPE_LABELS[row.entryType] },
    {
      id: 'amount',
      header: COPY.entryColumns.amount,
      align: 'end',
      cell: (row) => `${row.direction === 'credit' ? COPY.credit : COPY.debit}${formatMoney(row.amount)}`,
    },
    {
      id: 'balanceAfter',
      header: COPY.entryColumns.balanceAfter,
      align: 'end',
      cell: (row) => <Balance value={row.balanceAfter} />,
    },
    {
      id: 'reference',
      header: COPY.entryColumns.reference,
      cell: (row) => {
        const text = `${LEDGER_REFERENCE_TYPE_LABELS[row.referenceType]} ${COPY.shortId(row.referenceId)}`;
        return (
          <Link href={referenceHref(row, account)} className={linkClass}>
            {text}
          </Link>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${ACCOUNT_TYPE_LABELS[account.accountType]}: ${ownerLabel(account)}`}
        actions={
          <Link href={ROUTES.financeAccounts} className={`text-sm ${linkClass}`}>
            {COPY.backToAccounts}
          </Link>
        }
      />
      <dl className="space-y-1">
        <dt className="text-sm text-muted-foreground">{COPY.balance}</dt>
        <dd className="text-2xl font-semibold">
          <Balance value={account.balance} />
        </dd>
        <dd className="text-sm text-muted-foreground">{COPY.updated(formatDate(account.updatedAt))}</dd>
        <dd className="text-sm text-muted-foreground">{COPY.asyncNote}</dd>
      </dl>
      {entries.isError ? (
        <ErrorState
          message={COPY.entriesFailed}
          onRetry={() => void entries.refetch()}
          correlationId={isApiError(entries.error) ? (entries.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.entriesCaption}
          columns={columns}
          rows={entries.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(row) => row.id}
          loading={entries.isPending}
          hasMore={entries.hasNextPage}
          loadingMore={entries.isFetchingNextPage}
          onLoadMore={() => void entries.fetchNextPage()}
          toolbar={
            <div className="mb-4 space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{COPY.entryTypeFilter}</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  {LEDGER_ENTRY_TYPES.map((type) => (
                    <div key={type} className="flex items-center gap-2">
                      <Checkbox
                        id={`${id}-${type}`}
                        checked={filters.types.includes(type)}
                        onCheckedChange={(next) => {
                          const types = new Set(filters.types);
                          if (next === true) types.add(type);
                          else types.delete(type);
                          router.push(
                            href({ ...filters, types: LEDGER_ENTRY_TYPES.filter((t) => types.has(t)) }),
                          );
                        }}
                      />
                      <Label htmlFor={`${id}-${type}`} className="font-normal">
                        {LEDGER_ENTRY_TYPE_LABELS[type]}
                      </Label>
                    </div>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
                <div className="space-y-1">
                  <Label htmlFor={`${id}-from`}>{COPY.from}</Label>
                  <Input
                    id={`${id}-from`}
                    type="date"
                    value={filters.from ?? ''}
                    max={filters.to ?? undefined}
                    onChange={(event) => {
                      router.replace(
                        href({ ...filters, from: event.target.value === '' ? null : event.target.value }),
                      );
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${id}-to`}>{COPY.to}</Label>
                  <Input
                    id={`${id}-to`}
                    type="date"
                    value={filters.to ?? ''}
                    min={filters.from ?? undefined}
                    onChange={(event) => {
                      router.replace(
                        href({ ...filters, to: event.target.value === '' ? null : event.target.value }),
                      );
                    }}
                  />
                </div>
              </div>
            </div>
          }
          empty={
            narrowed ? (
              <EmptyState
                title={COPY.entriesEmptyFiltered}
                action={
                  <Link
                    href={href({ types: [], from: null, to: null })}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState title={COPY.entriesEmpty} />
            )
          }
        />
      )}
    </div>
  );
}
