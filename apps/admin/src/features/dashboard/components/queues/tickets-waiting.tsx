'use client';

import { inValues, unwrap } from '@nile/api';
import { formatDateTime } from '@nile/domain';
import Link from 'next/link';
import { browserApi } from '@/lib/browser-api';
import { ROUTES, supportTicketPath } from '@/lib/routes';
import { dashboardKeys } from '../../api';
import { DASHBOARD_COPY as COPY } from '../../copy';
import { dashboardQueueOptions, QueueCard, useQueueCard } from '../queue-card';

/** Tickets waiting for support: new and awaiting an answer (spec 03 §7.3). */
const WAITING_STATUSES = ['open', 'awaiting_admin'] as const;

/** AD-02 card (T-M1): tickets waiting longest first → AD-29; "See all" → AD-28. Live: `support.ticket_updated`. */
export function TicketsWaitingQueue() {
  const card = useQueueCard(
    dashboardQueueOptions(dashboardKeys.ticketsWaiting(), (limit, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/support/tickets', {
          params: {
            query: { limit, sort: 'awaitingAdminSince', 'status[in]': inValues(WAITING_STATUSES) },
          },
          signal,
        }),
      ),
    ),
  );
  return (
    <QueueCard
      title={COPY.ticketsTitle}
      seeAllHref={ROUTES.support}
      seeAllLabel={COPY.ticketsSeeAll}
      getRowId={(ticket) => ticket.id}
      renderRow={(ticket) => (
        <span className="flex flex-wrap justify-between gap-2">
          <Link
            href={supportTicketPath(ticket.id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {ticket.subject}
          </Link>
          <span className="text-muted-foreground">
            {ticket.awaitingAdminSince === null
              ? ticket.opener.displayName
              : COPY.ticketRow(ticket.opener.displayName, formatDateTime(ticket.awaitingAdminSince))}
          </span>
        </span>
      )}
      {...card}
    />
  );
}
