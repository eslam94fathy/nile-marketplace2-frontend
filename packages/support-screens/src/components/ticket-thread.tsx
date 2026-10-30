'use client';

import { isApiError } from '@nile/api';
import { TICKET_CATEGORY_LABELS, TICKET_STATUS_LABELS } from '@nile/domain';
import { useRealtimeConnected, useRealtimeMessage, useRealtimeStatus, useTicketRoom } from '@nile/realtime';
import {
  Button,
  buttonVariants,
  ErrorState,
  LoadingRegion,
  NotFoundScreen,
  PageHeader,
  Skeleton,
  StatusBadge,
  TICKET_STATUS_TONES,
} from '@nile/ui';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  markTicketRead,
  messagesOptions,
  MESSAGES_POLL_MS,
  supportKeys,
  ticketQuery,
  type Ticket,
  type TicketMessage,
} from '../api';
import { useSupportConfig } from '../config';
import { THREAD_COPY as COPY } from '../copy';
import { Composer } from './composer';
import { MessageItem } from './message-item';

/** A typing signal arrives every 3 s while the other side types; the line goes 5 s after the last one. */
export const TYPING_VISIBLE_MS = 5_000;
/** Within this many pixels of the end, the reader counts as "at the newest message". */
const AT_END_PX = 48;

/** A wrong id is answered like another user's ticket: not found (CLAUDE.md §3). */
const isTicketMissing = (error: unknown) =>
  isApiError(error, 'SUPPORT_TICKET_NOT_FOUND', 'VALIDATION_FAILED');

/** SF-31 / SE-26 Ticket thread: header, messages oldest at the top, composer (spec 00 §12.7). */
export function TicketThread({ ticketId }: { readonly ticketId: string }) {
  const { api, scope, routes, Link } = useSupportConfig();
  const ticket = useQuery({ ...ticketQuery(api, scope, ticketId), refetchOnWindowFocus: true });
  useTicketRoom(ticketId, { onNotFound: () => void ticket.refetch() });

  if (ticket.isError) {
    if (isTicketMissing(ticket.error)) {
      return (
        <NotFoundScreen
          homeLink={
            <Link href={routes.list('open')} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToTickets}
            </Link>
          }
        />
      );
    }
    return (
      <ErrorState
        message={COPY.loadFailed}
        onRetry={() => void ticket.refetch()}
        retrying={ticket.isFetching}
        correlationId={isApiError(ticket.error) ? (ticket.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  if (ticket.data === undefined) {
    return (
      <LoadingRegion className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64" />
      </LoadingRegion>
    );
  }
  return <Thread ticket={ticket.data} onStale={() => void ticket.refetch()} />;
}

function Thread({ ticket, onStale }: { readonly ticket: Ticket; readonly onStale: () => void }) {
  const { api, scope, routes, Link } = useSupportConfig();
  const queryClient = useQueryClient();
  const live = useRealtimeConnected();
  const messages = useInfiniteQuery({
    ...messagesOptions(api, scope, ticket.id),
    // Fallback only while no socket is connected; paused in background tabs (design 02 §5.2).
    refetchInterval: live ? false : MESSAGES_POLL_MS,
  });
  // The API pages newest first; the thread shows oldest first. Users never get internal notes; this keeps
  // that true on screen as well (SF-31 acceptance).
  const list: TicketMessage[] =
    messages.data?.pages
      .flatMap((page) => page.data)
      .filter((message) => message.kind !== 'internal_note')
      .reverse() ?? [];

  useMarkRead(ticket.id, list.at(-1)?.id ?? null);
  const typing = useOtherSideTyping(ticket.id);
  const reconnecting = useReconnecting();
  // Counts the user's own sends, so the view follows them even when scrolled up.
  const [sent, setSent] = useState(0);

  let content: ReactNode;
  if (messages.isPending) {
    content = (
      <LoadingRegion className="space-y-3">
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ms-auto h-16 w-2/3" />
      </LoadingRegion>
    );
  } else if (messages.isError) {
    content = (
      <ErrorState
        message={COPY.messagesLoadFailed}
        onRetry={() => void messages.refetch()}
        retrying={messages.isFetching}
        correlationId={isApiError(messages.error) ? (messages.error.correlationId ?? undefined) : undefined}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.subject}
        description={
          <>
            {COPY.ticket(ticket.ticketNumber)} · {TICKET_CATEGORY_LABELS[ticket.category]}
            {ticket.order === null ? null : (
              <>
                {' · '}
                <Link href={routes.order(ticket.order.id)} className="underline hover:text-foreground">
                  {COPY.order(ticket.order.orderNumber)}
                </Link>
              </>
            )}
          </>
        }
        actions={
          <StatusBadge value={ticket.status} labels={TICKET_STATUS_LABELS.user} tones={TICKET_STATUS_TONES} />
        }
      />

      <MessageViewport
        list={list}
        placeholder={content}
        reconnecting={reconnecting}
        sent={sent}
        hasEarlier={messages.hasNextPage}
        loadingEarlier={messages.isFetchingNextPage}
        onLoadEarlier={() => void messages.fetchNextPage()}
        onImageExpired={() => void messages.refetch()}
      />
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {typing ? COPY.supportTyping : ''}
      </p>

      {ticket.status === 'closed' ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">{COPY.closed}</p>
          <Link href={routes.newTicket} className={buttonVariants()}>
            {COPY.newTicket}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {ticket.status === 'resolved' ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">{COPY.resolved}</p>
          ) : null}
          <Composer
            ticketId={ticket.id}
            onStale={() => {
              onStale();
              void queryClient.invalidateQueries({ queryKey: supportKeys(scope).messages(ticket.id) });
            }}
            onSent={() => {
              setSent((count) => count + 1);
            }}
          />
        </div>
      )}
    </div>
  );
}

interface MessageViewportProps {
  /** Oldest first. */
  readonly list: readonly TicketMessage[];
  /** Loading or error state instead of the messages. */
  readonly placeholder: ReactNode;
  readonly reconnecting: boolean;
  /** Bumped after each of the user's own sends. */
  readonly sent: number;
  readonly hasEarlier: boolean;
  readonly loadingEarlier: boolean;
  readonly onLoadEarlier: () => void;
  readonly onImageExpired: () => void;
}

/**
 * The scrolling message list (spec 00 §12.7): opens at the newest message; follows new ones while the reader
 * is at the end (and always after their own send), otherwise offers "New messages ↓"; loading earlier messages
 * keeps the reader where they were. New messages from the other side are announced politely.
 */
function MessageViewport({
  list,
  placeholder,
  reconnecting,
  sent,
  hasEarlier,
  loadingEarlier,
  onLoadEarlier,
  onImageExpired,
}: MessageViewportProps) {
  const box = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const heightBeforeEarlier = useRef<number | null>(null);
  const seen = useRef<{ newest: string | null; ids: ReadonlySet<string>; sent: number } | null>(null);
  const [newBelow, setNewBelow] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const newestId = list.at(-1)?.id ?? null;
  const oldestId = list.at(0)?.id ?? null;

  useLayoutEffect(() => {
    const element = box.current;
    const previous = seen.current;
    seen.current = { newest: newestId, ids: new Set(list.map((message) => message.id)), sent };
    if (element === null || newestId === null) return;
    const scrollToEnd = () => {
      element.scrollTop = element.scrollHeight;
      atEnd.current = true;
      setNewBelow(false);
    };
    if (heightBeforeEarlier.current !== null) {
      // Earlier messages were added above: keep the same messages in view.
      element.scrollTop += element.scrollHeight - heightBeforeEarlier.current;
      heightBeforeEarlier.current = null;
    }
    const previousNewest = previous?.newest ?? null;
    if (previous === null || previousNewest === null) {
      scrollToEnd();
      return;
    }
    if (previousNewest === newestId) return;
    const fromOthers = list.filter((message) => !previous.ids.has(message.id) && !message.sender.isMe);
    if (fromOthers.length > 0) setAnnouncement(COPY.newMessageAnnouncement(fromOthers.length));
    if (atEnd.current || sent !== previous.sent) scrollToEnd();
    else setNewBelow(true);
    // `list` changes identity on every render; the ends and the send count say when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newestId, oldestId, sent]);

  return (
    <section aria-label={COPY.messagesLabel} className="relative rounded-lg border border-border">
      {reconnecting ? (
        <p role="status" className="border-b border-border px-4 py-2 text-sm text-muted-foreground">
          {COPY.reconnecting}
        </p>
      ) : null}
      <div
        ref={box}
        onScroll={() => {
          const element = box.current;
          if (element === null) return;
          atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight <= AT_END_PX;
          if (atEnd.current) setNewBelow(false);
        }}
        className="max-h-[60vh] overflow-y-auto p-4"
      >
        {placeholder ?? (
          <div className="space-y-4">
            {hasEarlier ? (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingEarlier}
                  onClick={() => {
                    heightBeforeEarlier.current = box.current?.scrollHeight ?? null;
                    onLoadEarlier();
                  }}
                >
                  {COPY.loadEarlier}
                </Button>
              </div>
            ) : null}
            <ol className="space-y-4">
              {list.map((message) => (
                <li key={message.id}>
                  <MessageItem message={message} onImageExpired={onImageExpired} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      {newBelow ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <Button
            size="sm"
            className="pointer-events-auto shadow-md"
            onClick={() => {
              const element = box.current;
              if (element !== null) element.scrollTop = element.scrollHeight;
              atEnd.current = true;
              setNewBelow(false);
            }}
          >
            {COPY.newMessages}
          </Button>
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/** Marks the ticket read when it opens and whenever a newer message is on screen in a visible tab. */
function useMarkRead(ticketId: string, newestId: string | null) {
  const { api, scope } = useSupportConfig();
  const queryClient = useQueryClient();
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (newestId === null) return undefined;
    const mark = () => {
      if (document.visibilityState !== 'visible' || marked.current === newestId) return;
      marked.current = newestId;
      markTicketRead(api, ticketId).then(
        () => queryClient.invalidateQueries({ queryKey: supportKeys(scope).lists() }),
        () => {
          // Not marked: try again with the next message or the next time the tab shows.
          marked.current = null;
        },
      );
    };
    mark();
    document.addEventListener('visibilitychange', mark);
    return () => {
      document.removeEventListener('visibilitychange', mark);
    };
  }, [api, newestId, queryClient, scope, ticketId]);
}

/** True for a few seconds after the other side's `support.typing` (never stored, backend realtime docs). */
function useOtherSideTyping(ticketId: string): boolean {
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useRealtimeMessage('support.typing', ({ data }) => {
    if (data.ticketId !== ticketId || data.role !== 'admin') return;
    setTyping(true);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setTyping(false);
    }, TYPING_VISIBLE_MS);
  });
  // A new message ends the typing line at once.
  useRealtimeMessage('support.message_created', ({ data }) => {
    if (data.ticketId === ticketId) setTyping(false);
  });
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return typing;
}

/** "Reconnecting…" only after the thread has been live once, not while the first connection opens. */
function useReconnecting(): boolean {
  const status = useRealtimeStatus();
  const [wasLive, setWasLive] = useState(false);
  if (status === 'connected' && !wasLive) setWasLive(true);
  return wasLive && (status === 'connecting' || status === 'disconnected');
}
