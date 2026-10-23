'use client';

import { isApiError } from '@nile/api';
import { AGENT_STATUS_LABELS, formatDate } from '@nile/domain';
import {
  AGENT_STATUS_TONES,
  buttonVariants,
  cn,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Select,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useGovernorateName, type AdminAgent } from '@/features/lookups';
import { agentPath, NEW_AGENT_PATH, ROUTES } from '@/lib/routes';
import { agentsListOptions } from '../api';
import { AGENTS_COPY as COPY } from '../copy';
import {
  agentFiltersQuery,
  hasNarrowingFilters,
  NAME_FILTER_MAX,
  parseAgentFilters,
  type AgentFilters,
  type RawAgentParams,
  type ShiftValue,
} from '../lib/list-params';
import { LoginStatus } from './login-status';

/** As the sellers' name search (AD-04): the filter waits for a pause in typing. */
export const NAME_SEARCH_DEBOUNCE_MS = 400;
const ANY = 'any';

const TABS = [
  { status: 'active', label: COPY.tabs.active },
  { status: 'inactive', label: COPY.tabs.inactive },
  { status: null, label: COPY.tabs.all },
] as const;

const listHref = (filters: AgentFilters): Route => {
  const query = agentFiltersQuery(filters);
  return query === '' ? ROUTES.agents : `${ROUTES.agents}?${query}`;
};

/** AD-09 Agents: status tabs, shift, home governorate and name search, all in the URL. */
export function AgentsList({ params }: { readonly params: RawAgentParams }) {
  const filters = parseAgentFilters(params);
  const router = useRouter();
  const agents = useInfiniteQuery(agentsListOptions(filters));
  const governorates = useGovernorateName();
  const navigate = (next: AgentFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };

  const columns: readonly DataTableColumn<AdminAgent>[] = [
    {
      id: 'name',
      header: COPY.columns.name,
      cell: (agent) => (
        <Link
          href={agentPath(agent.id)}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          {agent.fullName}
        </Link>
      ),
    },
    { id: 'email', header: COPY.columns.email, cell: (agent) => agent.email },
    { id: 'phone', header: COPY.columns.phone, cell: (agent) => agent.phone },
    {
      id: 'governorate',
      header: COPY.columns.governorate,
      cell: (agent) => governorates.name(agent.homeGovernorateId),
    },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (agent) => (
        <StatusBadge value={agent.status} labels={AGENT_STATUS_LABELS} tones={AGENT_STATUS_TONES} />
      ),
    },
    { id: 'login', header: COPY.columns.login, cell: (agent) => <LoginStatus value={agent.userStatus} /> },
    { id: 'shift', header: COPY.columns.shift, cell: (agent) => (agent.onShift ? COPY.yes : COPY.no) },
    { id: 'active', header: COPY.columns.active, align: 'end', cell: (agent) => agent.activeShipmentCount },
    {
      id: 'lastAssigned',
      header: COPY.columns.lastAssigned,
      cell: (agent) => (agent.lastAssignedAt === null ? COPY.never : formatDate(agent.lastAssignedAt)),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={COPY.title}
        actions={
          <Link href={NEW_AGENT_PATH} className={buttonVariants()}>
            {COPY.add}
          </Link>
        }
      />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const current = tab.status === filters.status;
            return (
              <li key={tab.label}>
                <Link
                  href={listHref({ ...filters, status: tab.status })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {agents.isError ? (
        <ErrorState
          message={COPY.listFailed}
          onRetry={() => void agents.refetch()}
          correlationId={isApiError(agents.error) ? (agents.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={agents.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(agent) => agent.id}
          loading={agents.isPending}
          hasMore={agents.hasNextPage}
          loadingMore={agents.isFetchingNextPage}
          onLoadMore={() => void agents.fetchNextPage()}
          toolbar={
            <Filters
              filters={filters}
              governorates={governorates.governorates}
              governoratesLoading={governorates.loading}
              onChange={navigate}
            />
          }
          empty={
            hasNarrowingFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link
                    href={listHref({ ...filters, shift: null, governorateId: null, name: null })}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    {COPY.clearFilters}
                  </Link>
                }
              />
            ) : (
              <EmptyState title={COPY.empty} />
            )
          }
        />
      )}
    </div>
  );
}

interface FiltersProps {
  readonly filters: AgentFilters;
  readonly governorates: readonly { readonly id: string; readonly name: string }[];
  readonly governoratesLoading: boolean;
  readonly onChange: (next: AgentFilters, replace?: boolean) => void;
}

function Filters({ filters, governorates, governoratesLoading, onChange }: FiltersProps) {
  const nameId = useId();
  const shiftId = useId();
  const governorateId = useId();
  const [name, setName] = useState(filters.name ?? '');

  // The URL changed from elsewhere (Back, a tab, "Clear filters"): show its value (adjusted while rendering).
  const [urlName, setUrlName] = useState(filters.name);
  if (urlName !== filters.name) {
    setUrlName(filters.name);
    if (name.trim() !== (filters.name ?? '')) setName(filters.name ?? '');
  }

  // The latest filters and callback, read when the timer fires: re-renders must not restart it.
  const latest = useRef({ filters, onChange });
  useEffect(() => {
    latest.current = { filters, onChange };
  });

  useEffect(() => {
    const trimmed = name.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === filters.name) return undefined;
    const timer = setTimeout(() => {
      latest.current.onChange({ ...latest.current.filters, name: next }, true);
    }, NAME_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [name, filters.name]);

  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor={nameId}>{COPY.nameFilter}</Label>
        <Input
          id={nameId}
          type="search"
          value={name}
          maxLength={NAME_FILTER_MAX}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={shiftId}>{COPY.shiftFilter}</Label>
        <Select
          id={shiftId}
          options={[
            { value: ANY, label: COPY.anyShift },
            { value: 'on', label: COPY.onShiftOption },
            { value: 'off', label: COPY.offShiftOption },
          ]}
          value={filters.shift ?? ANY}
          onValueChange={(value) => {
            onChange({ ...filters, shift: value === ANY ? null : (value as ShiftValue) });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={governorateId}>{COPY.governorateFilter}</Label>
        <Select
          id={governorateId}
          options={[
            { value: ANY, label: COPY.allGovernorates },
            ...governorates.map((governorate) => ({ value: governorate.id, label: governorate.name })),
          ]}
          value={filters.governorateId ?? ANY}
          onValueChange={(value) => {
            onChange({ ...filters, governorateId: value === ANY ? null : value });
          }}
          disabled={governoratesLoading}
        />
      </div>
    </div>
  );
}
