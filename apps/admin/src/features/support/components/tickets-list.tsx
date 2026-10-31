'use client';

import { isApiError } from '@nile/api';
import {
  formatRelativeTime,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  USER_ROLE_LABELS,
} from '@nile/domain';
import {
  Badge,
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
  TICKET_STATUS_TONES,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ROUTES, supportTicketPath } from '@/lib/routes';
import { ticketsListOptions, type AdminTicket } from '../api';
import { SUPPORT_COPY as COPY } from '../copy';
import {
  hasTicketFilters,
  OPENER_ROLES,
  parseTicketFilters,
  TICKET_VIEWS,
  ticketFiltersQuery,
  type RawTicketParams,
  type TicketFilters,
} from '../lib/list-params';

const ALL = 'all';

const listHref = (filters: TicketFilters): Route => {
  const query = ticketFiltersQuery(filters);
  return query === '' ? ROUTES.support : `${ROUTES.support}?${query}`;
};

export interface TicketsListProps {
  readonly params: RawTicketParams;
  /** The signed-in admin, for the "Mine" view. */
  readonly currentUserId: string;
}

/**
 * AD-28 Tickets: views (AD-Q-12), category, opener role and created dates in the URL; live through
 * `support.ticket_updated` / `support.message_created` (the shared invalidation map).
 */
export function TicketsList({ params, currentUserId }: TicketsListProps) {
  const filters = parseTicketFilters(params);
  const router = useRouter();
  const tickets = useInfiniteQuery(ticketsListOptions(filters, currentUserId));
  // "Waiting {relative}" is read against the time the list was shown; a refetch re-renders it.
  const [now] = useState(() => Date.now());
  const navigate = (next: TicketFilters) => {
    router.push(listHref(next));
  };

  const columns: readonly DataTableColumn<AdminTicket>[] = [
    {
      id: 'ticket',
      header: COPY.columns.ticket,
      cell: (ticket) => (
        <span className="flex flex-col">
          <span className="flex items-center gap-2">
            {ticket.hasUnread ? (
              <span className="size-2 shrink-0 rounded-full bg-primary">
                <span className="sr-only">{COPY.unread}</span>
              </span>
            ) : null}
            <Link
              href={supportTicketPath(ticket.id)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {ticket.subject}
            </Link>
          </span>
          <span className="text-muted-foreground">{COPY.ticket(ticket.ticketNumber)}</span>
        </span>
      ),
    },
    {
      id: 'opener',
      header: COPY.columns.opener,
      cell: (ticket) => (
        <span className="flex flex-col">
          <span>{ticket.opener.displayName}</span>
          <span className="text-muted-foreground">
            {COPY.openerLine(USER_ROLE_LABELS[ticket.opener.role], ticket.opener.email)}
          </span>
        </span>
      ),
    },
    {
      id: 'category',
      header: COPY.columns.category,
      cell: (ticket) => TICKET_CATEGORY_LABELS[ticket.category],
    },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (ticket) => (
        <StatusBadge value={ticket.status} labels={TICKET_STATUS_LABELS.admin} tones={TICKET_STATUS_TONES} />
      ),
    },
    {
      id: 'assigned',
      header: COPY.columns.assigned,
      cell: (ticket) => ticket.assignedAdmin?.displayName ?? COPY.unassigned,
    },
    {
      id: 'waiting',
      header: COPY.columns.waiting,
      cell: (ticket) => (
        <span className="flex flex-wrap items-center gap-2">
          {ticket.awaitingAdminSince === null
            ? COPY.none
            : COPY.waitingFor(formatRelativeTime(ticket.awaitingAdminSince, now))}
          {ticket.slaBreachedAt === null ? null : <Badge tone="destructive">{COPY.pastTarget}</Badge>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <nav aria-label={COPY.viewsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TICKET_VIEWS.map((view) => {
            const current = view === filters.view;
            return (
              <li key={view}>
                <Link
                  href={listHref({ ...filters, view })}
                  aria-current={current ? 'page' : undefined}
                  className={cn(buttonVariants({ variant: current ? 'primary' : 'outline', size: 'sm' }))}
                >
                  {COPY.views[view]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {tickets.isError ? (
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void tickets.refetch()}
          correlationId={isApiError(tickets.error) ? (tickets.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={tickets.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(ticket) => ticket.id}
          loading={tickets.isPending}
          hasMore={tickets.hasNextPage}
          loadingMore={tickets.isFetchingNextPage}
          onLoadMore={() => void tickets.fetchNextPage()}
          toolbar={<Filters filters={filters} onChange={navigate} />}
          empty={
            hasTicketFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link
                    href={listHref({
                      view: filters.view,
                      category: null,
                      opener: null,
                      from: null,
                      to: null,
                    })}
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

function Filters({
  filters,
  onChange,
}: {
  readonly filters: TicketFilters;
  readonly onChange: (next: TicketFilters) => void;
}) {
  const categoryId = useId();
  const openerId = useId();
  const fromId = useId();
  const toId = useId();
  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="space-y-1">
        <Label htmlFor={categoryId}>{COPY.categoryFilter}</Label>
        <Select
          id={categoryId}
          options={[
            { value: ALL, label: COPY.allCategories },
            ...TICKET_CATEGORIES.map((category) => ({
              value: category,
              label: TICKET_CATEGORY_LABELS[category],
            })),
          ]}
          value={filters.category ?? ALL}
          onValueChange={(value) => {
            onChange({
              ...filters,
              category: TICKET_CATEGORIES.find((category) => category === value) ?? null,
            });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={openerId}>{COPY.openerFilter}</Label>
        <Select
          id={openerId}
          options={[
            { value: ALL, label: COPY.allOpeners },
            ...OPENER_ROLES.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] })),
          ]}
          value={filters.opener ?? ALL}
          onValueChange={(value) => {
            onChange({ ...filters, opener: OPENER_ROLES.find((role) => role === value) ?? null });
          }}
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
            onChange({ ...filters, from: event.target.value === '' ? null : event.target.value });
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
            onChange({ ...filters, to: event.target.value === '' ? null : event.target.value });
          }}
        />
      </div>
    </div>
  );
}
