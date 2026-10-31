import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { supportKeys } from '@nile/support-screens';
import { queryOptions } from '@tanstack/react-query';
import { APP } from '@/lib/app';
import { browserApi } from '@/lib/browser-api';
import { ticketApiQuery, type TicketFilters } from './lib/list-params';

// Support console (spec 03 AD-28, AD-29; design 02 §5.2, §5.4). Keys keep the shape of the shared support
// screens' keys under the admin scope, so the shared thread, composer and `supportInvalidation` serve them.

export type AdminTicket = Schema<'AdminTicketSummaryDto'>;

const TICKETS_PAGE_SIZE = 20;

const keys = supportKeys(APP.name);

export const adminSupportKeys = {
  lists: keys.lists,
  list: (filters: TicketFilters) => queryKey(APP.name, 'support', 'list', filters),
  detail: keys.detail,
  messages: keys.messages,
};

export function ticketsListOptions(filters: TicketFilters, currentUserId: string) {
  return {
    ...infiniteListOptions({
      queryKey: adminSupportKeys.list(filters),
      fetchPage: async (cursor, signal) =>
        unwrap(
          browserApi.GET('/api/v1/admin/support/tickets', {
            params: {
              query: {
                limit: TICKETS_PAGE_SIZE,
                ...ticketApiQuery(filters, currentUserId),
                ...(cursor === undefined ? {} : { cursor }),
              },
            },
            signal,
          }),
        ),
    }),
    refetchOnWindowFocus: true,
  };
}

/** AD-29: stale 0; live messages and every action read it again. */
export function adminTicketQuery(ticketId: string) {
  return queryOptions({
    queryKey: adminSupportKeys.detail(ticketId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/support/tickets/{ticketId}', {
            params: { path: { ticketId } },
            signal,
          }),
        )
      ).data,
    staleTime: 0,
  });
}

/** No such ticket, or not a ticket id at all (the backend checks the id format first, as R-36). */
export function isTicketMissing(error: unknown): boolean {
  return isApiError(error, 'SUPPORT_TICKET_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const ticketPath = (ticketId: string) => ({ params: { path: { ticketId } } });

/** `null` unassigns (`AssignTicketDto.adminUserId` is required and nullable, OA-6). */
export async function assignTicket(ticketId: string, adminUserId: string | null): Promise<AdminTicket> {
  return (
    await unwrap(
      browserApi.POST('/api/v1/admin/support/tickets/{ticketId}/assign', {
        ...ticketPath(ticketId),
        body: { adminUserId },
      }),
    )
  ).data;
}

export async function resolveTicket(ticketId: string): Promise<AdminTicket> {
  return (
    await unwrap(browserApi.POST('/api/v1/admin/support/tickets/{ticketId}/resolve', ticketPath(ticketId)))
  ).data;
}

export async function closeTicket(ticketId: string): Promise<AdminTicket> {
  return (
    await unwrap(browserApi.POST('/api/v1/admin/support/tickets/{ticketId}/close', ticketPath(ticketId)))
  ).data;
}
