'use client';

import { isApiError } from '@nile/api';
import { formatRelativeTime, TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from '@nile/domain';
import {
  buttonVariants,
  EmptyState,
  ErrorState,
  LoadingRegion,
  LoadMore,
  PageHeader,
  Skeleton,
  StatusBadge,
  TICKET_STATUS_TONES,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ticketsListOptions, type SupportTab, type Ticket } from '../api';
import { useSupportConfig } from '../config';
import { TICKET_LIST_COPY as COPY } from '../copy';
import { SUPPORT_TABS } from '../tabs';
import { useNow } from '../use-now';

const SKELETON_ROWS = 3;

function Row({ ticket, now }: { readonly ticket: Ticket; readonly now: number }) {
  const { Link, routes } = useSupportConfig();
  return (
    <article className="relative flex flex-wrap items-start justify-between gap-3 py-4 hover:bg-muted/50">
      <div className="min-w-0 space-y-1 text-sm">
        <h2 className="flex items-center gap-2 text-base font-medium">
          {ticket.hasUnread ? (
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />
          ) : null}
          <Link href={routes.ticket(ticket.id)} className="after:absolute after:inset-0 after:content-['']">
            {ticket.subject}
          </Link>
        </h2>
        <p className="text-muted-foreground">
          {COPY.ticket(ticket.ticketNumber)} · {TICKET_CATEGORY_LABELS[ticket.category]}
          {ticket.order === null ? null : <> · {COPY.order(ticket.order.orderNumber)}</>}
        </p>
        <p className="text-muted-foreground">
          <time dateTime={ticket.lastMessageAt}>
            {COPY.lastActivity(formatRelativeTime(ticket.lastMessageAt, now))}
          </time>
        </p>
      </div>
      <div className="flex flex-col items-end gap-2 text-sm">
        <StatusBadge value={ticket.status} labels={TICKET_STATUS_LABELS.user} tones={TICKET_STATUS_TONES} />
        {/* Text, not only the dot (conventions §10: no colour-only meaning). */}
        {ticket.hasUnread ? <span className="font-medium text-primary">{COPY.newReply}</span> : null}
      </div>
    </article>
  );
}

/** SF-29 / SE-24 Support tickets: open / closed tabs in the URL (`?status=`), latest activity first. */
export function TicketList({ tab }: { readonly tab: SupportTab }) {
  const { api, scope, Link, routes } = useSupportConfig();
  const tickets = useInfiniteQuery(ticketsListOptions(api, scope, tab));
  const now = useNow();

  let body;
  if (tickets.isPending) {
    body = (
      <LoadingRegion className="space-y-3">
        {Array.from({ length: SKELETON_ROWS }, (_, index) => (
          <Skeleton key={index} className="h-20" />
        ))}
      </LoadingRegion>
    );
  } else if (tickets.isError) {
    body = (
      <ErrorState
        message={COPY.loadFailed}
        onRetry={() => void tickets.refetch()}
        retrying={tickets.isFetching}
        correlationId={isApiError(tickets.error) ? (tickets.error.correlationId ?? undefined) : undefined}
      />
    );
  } else {
    const rows = tickets.data.pages.flatMap((page) => page.data);
    body =
      rows.length === 0 ? (
        <EmptyState title={tab === 'open' ? COPY.empty : COPY.emptyClosed} />
      ) : (
        <div>
          <ul className="divide-y divide-border">
            {rows.map((ticket) => (
              <li key={ticket.id}>
                <Row ticket={ticket} now={now} />
              </li>
            ))}
          </ul>
          <LoadMore
            hasMore={tickets.hasNextPage}
            loading={tickets.isFetchingNextPage}
            loadedCount={rows.length}
            onLoadMore={() => void tickets.fetchNextPage()}
          />
        </div>
      );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={COPY.title}
        actions={
          <Link href={routes.newTicket} className={buttonVariants()}>
            {COPY.newTicket}
          </Link>
        }
      />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {SUPPORT_TABS.map((key) => (
            <li key={key}>
              <Link
                href={routes.list(key)}
                aria-current={key === tab ? 'page' : undefined}
                className={buttonVariants({ variant: key === tab ? 'primary' : 'outline', size: 'sm' })}
              >
                {COPY.tabs[key]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {body}
    </div>
  );
}
