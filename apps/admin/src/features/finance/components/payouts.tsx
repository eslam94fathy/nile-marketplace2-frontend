'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, formatMoney } from '@nile/domain';
import {
  Button,
  buttonVariants,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useActorLabel, useAgentNames, useSellerNames } from '@/features/lookups';
import { agentPath, ROUTES, sellerPath } from '@/lib/routes';
import { payoutsListOptions, type Payout } from '../api';
import { FINANCE_COPY as COPY } from '../copy';
import {
  parsePayoutFilters,
  PAYEE_TYPES,
  payoutFiltersQuery,
  type PayoutFilters,
  type RawParams,
} from '../lib/params';
import { RecordPayoutDialog } from './record-payout-dialog';

const linkClass = 'font-medium text-primary underline-offset-4 hover:underline';
const TABS = [...PAYEE_TYPES, null] as const;

const listHref = (filters: PayoutFilters): Route => {
  const query = payoutFiltersQuery(filters);
  return query === '' ? ROUTES.payouts : `${ROUTES.payouts}?${query}`;
};

export interface PayoutsProps {
  readonly params: RawParams;
  readonly currentUserId: string;
}

/**
 * AD-21 Payouts: payee type tabs (no parameter = All), one payee and dates in the URL; "Record payout"
 * prefilled with the payee filter.
 */
export function Payouts({ params, currentUserId }: PayoutsProps) {
  const filters = parsePayoutFilters(params);
  const router = useRouter();
  const id = useId();
  const [recording, setRecording] = useState(false);
  const payouts = useInfiniteQuery(payoutsListOptions(filters));
  const rows = payouts.data?.pages.flatMap((page) => page.data) ?? [];
  const idsOf = (type: Payout['payeeType']) => [
    ...rows.filter((row) => row.payeeType === type).map((row) => row.payeeId),
    filters.payeeType === type ? filters.payeeId : null,
  ];
  const sellerName = useSellerNames(idsOf('seller'));
  const agentName = useAgentNames(idsOf('agent'));
  const actor = useActorLabel(currentUserId);
  const nameOf = (type: Payout['payeeType'], payeeId: string) =>
    (type === 'seller' ? sellerName(payeeId) : agentName(payeeId)) ?? COPY.shortId(payeeId);
  const navigate = (next: PayoutFilters) => {
    router.replace(listHref(next));
  };

  const columns: readonly DataTableColumn<Payout>[] = [
    { id: 'paidAt', header: COPY.payoutColumns.paidAt, cell: (row) => formatDateTime(row.paidAt) },
    {
      id: 'payee',
      header: COPY.payoutColumns.payee,
      cell: (row) => (
        <span>
          {COPY.payeeTypeLabels[row.payeeType]}:{' '}
          <Link
            href={row.payeeType === 'seller' ? sellerPath(row.payeeId) : agentPath(row.payeeId)}
            className={linkClass}
          >
            {nameOf(row.payeeType, row.payeeId)}
          </Link>
        </span>
      ),
    },
    { id: 'amount', header: COPY.payoutColumns.amount, align: 'end', cell: (row) => formatMoney(row.amount) },
    { id: 'reference', header: COPY.payoutColumns.reference, cell: (row) => row.externalReference },
    { id: 'by', header: COPY.payoutColumns.by, cell: (row) => actor(row.recordedByUserId, 'admin') },
    { id: 'recordedAt', header: COPY.payoutColumns.recordedAt, cell: (row) => formatDateTime(row.createdAt) },
  ];
  const narrowed = filters.payeeId !== null || filters.from !== null || filters.to !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={COPY.payoutsTitle}
        actions={
          <Button
            onClick={() => {
              setRecording(true);
            }}
          >
            {COPY.payoutTitle}
          </Button>
        }
      />
      <nav aria-label={COPY.payeeTabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((type) => {
            const current = type === filters.payeeType;
            return (
              <li key={type ?? 'all'}>
                <Link
                  href={listHref({ ...filters, payeeType: type, payeeId: null })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {COPY.payeeTabs[type ?? 'all']}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {payouts.isError ? (
        <ErrorState
          message={COPY.payoutsFailed}
          onRetry={() => void payouts.refetch()}
          correlationId={isApiError(payouts.error) ? (payouts.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.payoutsCaption}
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          loading={payouts.isPending}
          hasMore={payouts.hasNextPage}
          loadingMore={payouts.isFetchingNextPage}
          onLoadMore={() => void payouts.fetchNextPage()}
          toolbar={
            <div className="mb-4 space-y-3">
              {filters.payeeType === null || filters.payeeId === null ? null : (
                <p className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">
                    {COPY.payeeFilter(nameOf(filters.payeeType, filters.payeeId))}
                  </span>
                  <Link href={listHref({ ...filters, payeeId: null })} className={linkClass}>
                    {COPY.clearPayee}
                  </Link>
                </p>
              )}
              <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
                <div className="space-y-1">
                  <Label htmlFor={`${id}-from`}>{COPY.from}</Label>
                  <Input
                    id={`${id}-from`}
                    type="date"
                    value={filters.from ?? ''}
                    max={filters.to ?? undefined}
                    onChange={(event) => {
                      navigate({ ...filters, from: event.target.value === '' ? null : event.target.value });
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
                      navigate({ ...filters, to: event.target.value === '' ? null : event.target.value });
                    }}
                  />
                </div>
              </div>
            </div>
          }
          empty={
            narrowed ? (
              <EmptyState
                title={COPY.payoutsEmptyFiltered}
                action={
                  <Link
                    href={listHref({ ...filters, payeeId: null, from: null, to: null })}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState title={COPY.payoutsEmpty} />
            )
          }
        />
      )}
      {recording ? (
        <RecordPayoutDialog
          initialPayee={
            filters.payeeType === null ? null : { payeeType: filters.payeeType, payeeId: filters.payeeId }
          }
          onClose={() => {
            setRecording(false);
          }}
        />
      ) : null}
    </div>
  );
}
