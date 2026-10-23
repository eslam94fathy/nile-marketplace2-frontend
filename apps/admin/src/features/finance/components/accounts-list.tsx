'use client';

import { isApiError } from '@nile/api';
import { ACCOUNT_TYPE_LABELS, formatDateTime } from '@nile/domain';
import {
  buttonVariants,
  Checkbox,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  Label,
  PageHeader,
  Select,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { accountPath, agentPayoutPath, agentRemittancePath, ROUTES, sellerPayoutPath } from '@/lib/routes';
import { accountsListOptions, type Account } from '../api';
import { FINANCE_COPY as COPY } from '../copy';
import {
  ACCOUNT_SORTS,
  ACCOUNT_TABS,
  accountFiltersQuery,
  parseAccountFilters,
  type AccountFilters,
  type AccountSort,
  type AccountTab,
  type RawParams,
} from '../lib/params';
import { Balance } from './balance';

const TABS = Object.keys(ACCOUNT_TABS) as AccountTab[];
const SORTS = Object.keys(ACCOUNT_SORTS) as AccountSort[];
const linkClass = 'font-medium text-primary underline-offset-4 hover:underline';

const listHref = (filters: AccountFilters): Route => {
  const query = accountFiltersQuery(filters);
  return query === '' ? ROUTES.financeAccounts : `${ROUTES.financeAccounts}?${query}`;
};

/** Platform accounts have no owner: they are Nile's own (spec 03 AD-18). */
export const ownerLabel = (account: Pick<Account, 'ownerName' | 'ownerId'>): string =>
  account.ownerName ?? (account.ownerId === null ? COPY.nile : COPY.shortId(account.ownerId));

/** The account's money action, prefilled for its owner (AD-20 / AD-21). */
function ownerAction(account: Account) {
  if (account.ownerId === null) return null;
  if (account.accountType === 'seller_payable')
    return { href: sellerPayoutPath(account.ownerId), label: COPY.recordPayout };
  if (account.accountType === 'agent_fee_payable')
    return { href: agentPayoutPath(account.ownerId), label: COPY.recordPayout };
  if (account.accountType === 'agent_cod_cash')
    return { href: agentRemittancePath(account.ownerId), label: COPY.recordCash };
  return null;
}

/** AD-18 Finance accounts: type tabs, non-zero, owner and sort in the URL. */
export function AccountsList({ params }: { readonly params: RawParams }) {
  const filters = parseAccountFilters(params);
  const router = useRouter();
  const id = useId();
  const accounts = useInfiniteQuery(accountsListOptions(filters));
  const help = COPY.accountHelp[filters.tab];

  const columns: readonly DataTableColumn<Account>[] = [
    { id: 'type', header: COPY.accountColumns.type, cell: (row) => ACCOUNT_TYPE_LABELS[row.accountType] },
    { id: 'owner', header: COPY.accountColumns.owner, cell: (row) => ownerLabel(row) },
    {
      id: 'balance',
      header: COPY.accountColumns.balance,
      align: 'end',
      cell: (row) => <Balance value={row.balance} />,
    },
    { id: 'updated', header: COPY.accountColumns.updated, cell: (row) => formatDateTime(row.updatedAt) },
    {
      id: 'actions',
      header: COPY.accountColumns.actions,
      cell: (row) => {
        const action = ownerAction(row);
        return (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Link
              href={accountPath(row.id)}
              aria-label={COPY.statementFor(ownerLabel(row))}
              className={linkClass}
            >
              {COPY.statement}
            </Link>
            {action === null ? null : (
              <Link href={action.href} className={linkClass}>
                {action.label}
              </Link>
            )}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.accountsTitle} />
      <nav aria-label={COPY.accountTabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const current = tab === filters.tab;
            return (
              <li key={tab}>
                <Link
                  href={listHref({ ...filters, tab })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {COPY.accountTabs[tab]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {help === '' ? null : <p className="text-sm text-muted-foreground">{help}</p>}
      <p className="text-sm text-muted-foreground">{COPY.asyncNote}</p>
      {accounts.isError ? (
        <ErrorState
          message={COPY.accountsFailed}
          onRetry={() => void accounts.refetch()}
          correlationId={isApiError(accounts.error) ? (accounts.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.accountsCaption}
          columns={columns}
          rows={accounts.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(row) => row.id}
          loading={accounts.isPending}
          hasMore={accounts.hasNextPage}
          loadingMore={accounts.isFetchingNextPage}
          onLoadMore={() => void accounts.fetchNextPage()}
          toolbar={
            <div className="mb-4 flex flex-wrap items-end gap-6">
              {filters.ownerId === null ? null : (
                <p className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{COPY.ownerFilter(filters.ownerId)}</span>
                  <Link href={listHref({ ...filters, ownerId: null })} className={linkClass}>
                    {COPY.clearOwner}
                  </Link>
                </p>
              )}
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-nonzero`}
                  checked={filters.nonZero}
                  onCheckedChange={(next) => {
                    router.replace(listHref({ ...filters, nonZero: next === true }));
                  }}
                />
                <Label htmlFor={`${id}-nonzero`} className="font-normal">
                  {COPY.nonZero}
                </Label>
              </div>
              <div className="w-60 space-y-1">
                <Label htmlFor={`${id}-sort`}>{COPY.sortLabel}</Label>
                <Select
                  id={`${id}-sort`}
                  options={SORTS.map((sort) => ({ value: sort, label: COPY.sorts[sort] }))}
                  value={filters.sort}
                  onValueChange={(value) => {
                    router.replace(listHref({ ...filters, sort: value as AccountSort }));
                  }}
                />
              </div>
            </div>
          }
          empty={
            filters.ownerId !== null || filters.nonZero ? (
              <EmptyState
                title={COPY.accountsEmptyFiltered}
                action={
                  <Link
                    href={listHref({ ...filters, ownerId: null, nonZero: false })}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState title={COPY.accountsEmpty} />
            )
          }
        />
      )}
    </div>
  );
}
