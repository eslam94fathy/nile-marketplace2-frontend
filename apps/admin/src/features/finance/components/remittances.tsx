'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, formatMoney } from '@nile/domain';
import {
  Button,
  buttonVariants,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Select,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { agentPickerQuery, useActorLabel, useAgentNames } from '@/features/lookups';
import { agentPath, ROUTES } from '@/lib/routes';
import { remittancesListOptions, type Remittance } from '../api';
import { FINANCE_COPY as COPY } from '../copy';
import {
  parseRemittanceFilters,
  remittanceFiltersQuery,
  type RawParams,
  type RemittanceFilters,
} from '../lib/params';
import { RecordRemittanceDialog } from './record-remittance-dialog';

const ALL = 'all';
const linkClass = 'font-medium text-primary underline-offset-4 hover:underline';

const listHref = (filters: RemittanceFilters): Route => {
  const query = remittanceFiltersQuery(filters);
  return query === '' ? ROUTES.remittances : `${ROUTES.remittances}?${query}`;
};

export interface RemittancesProps {
  readonly params: RawParams;
  readonly currentUserId: string;
}

/** AD-20 COD remittances: agent and dates in the URL; "Record cash received" prefilled with the agent filter. */
export function Remittances({ params, currentUserId }: RemittancesProps) {
  const filters = parseRemittanceFilters(params);
  const router = useRouter();
  const id = useId();
  const [recording, setRecording] = useState(false);
  const remittances = useInfiniteQuery(remittancesListOptions(filters));
  const rows = remittances.data?.pages.flatMap((page) => page.data) ?? [];
  const agents = useQuery(agentPickerQuery());
  const agentName = useAgentNames([...rows.map((row) => row.agentId), filters.agentId]);
  const actor = useActorLabel(currentUserId);
  const navigate = (next: RemittanceFilters) => {
    router.replace(listHref(next));
  };

  const agentOptions = (agents.data ?? []).map((agent) => ({ value: agent.id, label: agent.fullName }));
  if (filters.agentId !== null && !agentOptions.some((option) => option.value === filters.agentId)) {
    agentOptions.unshift({
      value: filters.agentId,
      label: agentName(filters.agentId) ?? COPY.shortId(filters.agentId),
    });
  }

  const columns: readonly DataTableColumn<Remittance>[] = [
    { id: 'date', header: COPY.remittanceColumns.date, cell: (row) => formatDateTime(row.createdAt) },
    {
      id: 'agent',
      header: COPY.remittanceColumns.agent,
      cell: (row) => (
        <Link href={agentPath(row.agentId)} className={linkClass}>
          {agentName(row.agentId) ?? COPY.shortId(row.agentId)}
        </Link>
      ),
    },
    {
      id: 'amount',
      header: COPY.remittanceColumns.amount,
      align: 'end',
      cell: (row) => formatMoney(row.amount),
    },
    { id: 'note', header: COPY.remittanceColumns.note, cell: (row) => row.note ?? COPY.none },
    { id: 'by', header: COPY.remittanceColumns.by, cell: (row) => actor(row.confirmedByUserId, 'admin') },
  ];
  const narrowed = filters.agentId !== null || filters.from !== null || filters.to !== null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={COPY.remittancesTitle}
        actions={
          <Button
            onClick={() => {
              setRecording(true);
            }}
          >
            {COPY.cashTitle}
          </Button>
        }
      />
      {remittances.isError ? (
        <ErrorState
          message={COPY.remittancesFailed}
          onRetry={() => void remittances.refetch()}
          correlationId={
            isApiError(remittances.error) ? (remittances.error.correlationId ?? undefined) : undefined
          }
        />
      ) : (
        <DataTable
          caption={COPY.remittancesCaption}
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          loading={remittances.isPending}
          hasMore={remittances.hasNextPage}
          loadingMore={remittances.isFetchingNextPage}
          onLoadMore={() => void remittances.fetchNextPage()}
          toolbar={
            <div className="mb-4 grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`${id}-agent`}>{COPY.agentFilter}</Label>
                <Select
                  id={`${id}-agent`}
                  options={[{ value: ALL, label: COPY.allAgents }, ...agentOptions]}
                  value={filters.agentId ?? ALL}
                  onValueChange={(value) => {
                    navigate({ ...filters, agentId: value === ALL ? null : value });
                  }}
                  disabled={agents.isPending}
                />
              </div>
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
          }
          empty={
            narrowed ? (
              <EmptyState
                title={COPY.remittancesEmptyFiltered}
                action={
                  <Link href={ROUTES.remittances} className={buttonVariants({ variant: 'outline' })}>
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState title={COPY.remittancesEmpty} />
            )
          }
        />
      )}
      {recording ? (
        <RecordRemittanceDialog
          initialAgentId={filters.agentId}
          onClose={() => {
            setRecording(false);
          }}
        />
      ) : null}
    </div>
  );
}
