'use client';

import { isApiError } from '@nile/api';
import { buttonVariants, cn, EmptyState, ErrorState, Input, Label, PageHeader, Select } from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId } from 'react';
import { agentPickerQuery, useAgentNames } from '@/features/lookups';
import { ROUTES } from '@/lib/routes';
import { shipmentsListOptions } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import {
  hasNarrowingFilters,
  parseShipmentFilters,
  SHIPMENT_TABS,
  shipmentFiltersQuery,
  type RawShipmentParams,
  type ShipmentFilters,
  type ShipmentTab,
} from '../lib/list-params';
import { ShipmentsTable } from './shipments-table';

const ALL = 'all';
const TABS = Object.keys(SHIPMENT_TABS) as ShipmentTab[];

const listHref = (filters: ShipmentFilters): Route => {
  const query = shipmentFiltersQuery(filters);
  return query === '' ? ROUTES.shipments : `${ROUTES.shipments}?${query}`;
};

/** AD-12 Shipments: status tabs, agent, order and created dates, all in the URL. */
export function ShipmentsList({ params }: { readonly params: RawShipmentParams }) {
  const filters = parseShipmentFilters(params);
  const router = useRouter();
  const shipments = useInfiniteQuery(shipmentsListOptions(filters));
  const navigate = (next: ShipmentFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.tabsLabel}>
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
                  {COPY.tabs[tab]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {shipments.isError ? (
        <ErrorState
          message={COPY.listFailed}
          onRetry={() => void shipments.refetch()}
          correlationId={
            isApiError(shipments.error) ? (shipments.error.correlationId ?? undefined) : undefined
          }
        />
      ) : (
        <ShipmentsTable
          caption={COPY.caption}
          query={shipments}
          toolbar={<Filters filters={filters} onChange={navigate} />}
          empty={
            hasNarrowingFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link
                    href={listHref({ ...filters, agentId: null, orderId: null, from: null, to: null })}
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
  readonly filters: ShipmentFilters;
  readonly onChange: (next: ShipmentFilters, replace?: boolean) => void;
}

function Filters({ filters, onChange }: FiltersProps) {
  const agentId = useId();
  const fromId = useId();
  const toId = useId();
  const agents = useQuery(agentPickerQuery());
  // An agent from the URL that isn't in the picker's page still gets its name.
  const agentName = useAgentNames([filters.agentId]);
  const options = (agents.data ?? []).map((agent) => ({ value: agent.id, label: agent.fullName }));
  if (filters.agentId !== null && !options.some((option) => option.value === filters.agentId)) {
    options.unshift({
      value: filters.agentId,
      label: agentName(filters.agentId) ?? COPY.shortId(filters.agentId),
    });
  }

  return (
    <div className="mb-4 space-y-3">
      {filters.orderId === null ? null : (
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">{COPY.orderFilter(filters.orderId)}</span>
          <Link
            href={listHref({ ...filters, orderId: null })}
            className="text-primary underline-offset-4 hover:underline"
          >
            {COPY.clearOrder}
          </Link>
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor={agentId}>{COPY.agentFilter}</Label>
          <Select
            id={agentId}
            options={[{ value: ALL, label: COPY.allAgents }, ...options]}
            value={filters.agentId ?? ALL}
            onValueChange={(value) => {
              onChange({ ...filters, agentId: value === ALL ? null : value });
            }}
            disabled={agents.isPending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={fromId}>{COPY.from}</Label>
          <Input
            id={fromId}
            type="date"
            value={filters.from ?? ''}
            max={filters.to ?? undefined}
            onChange={(event) => {
              onChange({ ...filters, from: event.target.value === '' ? null : event.target.value }, true);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={toId}>{COPY.to}</Label>
          <Input
            id={toId}
            type="date"
            value={filters.to ?? ''}
            min={filters.from ?? undefined}
            onChange={(event) => {
              onChange({ ...filters, to: event.target.value === '' ? null : event.target.value }, true);
            }}
          />
        </div>
      </div>
    </div>
  );
}
