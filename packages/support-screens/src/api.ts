import { inValues, type ApiClient, type Schema, unwrap } from '@nile/api';
import type { TicketStatus } from '@nile/domain';
import { infiniteListOptions, queryKey, type QueryScope } from '@nile/query';
import type { InvalidationMap } from '@nile/realtime';
import { queryOptions } from '@tanstack/react-query';
import type { SupportAudience } from './config';

// Support tickets for customers and sellers (design 02 §5.2 "Shared"): the list, one ticket and its messages.
// Keys live under the app's scope, so sign-out clears them. The admin console (T-M5) reads messages, posts and
// marks read through the admin endpoints under the same keys, so one invalidation map serves every app.

export type Ticket = Schema<'TicketSummaryDto'>;
export type TicketMessage = Schema<'TicketMessageDto'>;
export type OpenTicketBody = Schema<'CustomerOpenTicketDto'>;
export type PostMessageBody = Schema<'PostMessageDto'>;
export type AdminPostMessageBody = Schema<'AdminPostMessageDto'>;
export type AppScope = Exclude<QueryScope, 'public'>;

/** List tabs (spec 01 SF-29): "Open" holds everything not yet closed, a solved ticket included. */
export const SUPPORT_TAB_STATUSES = {
  open: ['open', 'awaiting_admin', 'awaiting_user', 'resolved'],
  closed: ['closed'],
} as const satisfies Record<string, readonly TicketStatus[]>;

export type SupportTab = keyof typeof SUPPORT_TAB_STATUSES;

export const TICKETS_PAGE_SIZE = 20;
export const MESSAGES_PAGE_SIZE = 20;
/** Without a socket an open thread is read again every 10 s while the tab is visible (design 02 §5.2). */
export const MESSAGES_POLL_MS = 10_000;
/** Body 1..4000, subject 3..150, up to 3 photos (backend spec 16 §1). */
export const MESSAGE_MAX = 4000;
export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 150;
export const ATTACHMENTS_MAX = 3;

export const supportKeys = (scope: AppScope) => ({
  /** Prefix of every tab of the list. */
  lists: () => queryKey(scope, 'support', 'list'),
  list: (tab: SupportTab) => queryKey(scope, 'support', 'list', { tab }),
  detail: (ticketId: string) => queryKey(scope, 'support', 'detail', { ticketId }),
  messages: (ticketId: string) => queryKey(scope, 'support', 'messages', { ticketId }),
  /** SF-30 order select (the app loads it). */
  orderChoices: (selectedOrderId: string | null) =>
    queryKey(scope, 'support', 'orderChoices', { selectedOrderId }),
});

/** Realtime messages → the support keys they make stale (design 02 §5.3). */
export function supportInvalidation(scope: AppScope) {
  const keys = supportKeys(scope);
  return {
    'support.ticket_updated': ({ ticketId }) => [keys.lists(), keys.detail(ticketId)],
    'support.message_created': ({ ticketId }) => [keys.lists(), keys.messages(ticketId)],
  } satisfies InvalidationMap;
}

/** `GET /support/tickets`, latest activity first (the API's default sort). */
export function ticketsListOptions(api: ApiClient, scope: AppScope, tab: SupportTab) {
  return infiniteListOptions({
    queryKey: supportKeys(scope).list(tab),
    fetchPage: (cursor, signal) =>
      unwrap(
        api.GET('/api/v1/support/tickets', {
          params: {
            query: {
              limit: TICKETS_PAGE_SIZE,
              sort: '-lastMessageAt',
              'status[in]': inValues(SUPPORT_TAB_STATUSES[tab]),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

export function ticketQuery(api: ApiClient, scope: AppScope, ticketId: string) {
  return queryOptions({
    queryKey: supportKeys(scope).detail(ticketId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          api.GET('/api/v1/support/tickets/{ticketId}', { params: { path: { ticketId } }, signal }),
        )
      ).data,
    staleTime: 0,
  });
}

/**
 * Newest first, as the API pages them; the thread reverses them (spec 00 §12.7). Admins also get internal
 * notes [SPEC 16].
 */
export function messagesOptions(
  api: ApiClient,
  scope: AppScope,
  ticketId: string,
  audience: SupportAudience = 'user',
) {
  return infiniteListOptions({
    queryKey: supportKeys(scope).messages(ticketId),
    fetchPage: (cursor, signal) => {
      const params = {
        path: { ticketId },
        query: { limit: MESSAGES_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) },
      };
      return unwrap(
        audience === 'admin'
          ? api.GET('/api/v1/admin/support/tickets/{ticketId}/messages', { params, signal })
          : api.GET('/api/v1/support/tickets/{ticketId}/messages', { params, signal }),
      );
    },
    staleTime: 0,
  });
}

export async function openTicket(
  api: ApiClient,
  body: OpenTicketBody,
  idempotencyKey: string,
): Promise<Ticket> {
  return (
    await unwrap(
      api.POST('/api/v1/support/tickets', {
        body,
        params: { header: { 'Idempotency-Key': idempotencyKey } },
      }),
    )
  ).data;
}

/** A user's message, or an admin's reply or internal note (`internal: true`, sent only for a note). */
export async function postMessage(
  api: ApiClient,
  ticketId: string,
  body: PostMessageBody | AdminPostMessageBody,
  idempotencyKey: string,
  audience: SupportAudience = 'user',
): Promise<TicketMessage> {
  const params = { path: { ticketId }, header: { 'Idempotency-Key': idempotencyKey } };
  return (
    await unwrap(
      audience === 'admin'
        ? api.POST('/api/v1/admin/support/tickets/{ticketId}/messages', { body, params })
        : api.POST('/api/v1/support/tickets/{ticketId}/messages', { body, params }),
    )
  ).data;
}

export async function markTicketRead(
  api: ApiClient,
  ticketId: string,
  audience: SupportAudience = 'user',
): Promise<void> {
  const params = { path: { ticketId } };
  await unwrap(
    audience === 'admin'
      ? api.POST('/api/v1/admin/support/tickets/{ticketId}/read', { params })
      : api.POST('/api/v1/support/tickets/{ticketId}/read', { params }),
  );
}
