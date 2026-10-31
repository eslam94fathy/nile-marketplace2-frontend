'use client';

import { isApiError } from '@nile/api';
import {
  formatDateTime,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_LABELS,
  USER_ROLE_LABELS,
  type TicketStatus,
} from '@nile/domain';
import { errorMessage } from '@nile/query';
import { useTicketRoom } from '@nile/realtime';
import {
  Composer,
  MessageViewport,
  messagesPlaceholder,
  useMarkRead,
  useOtherSideTyping,
  useReconnecting,
  useThreadMessages,
} from '@nile/support-screens';
import {
  Button,
  buttonVariants,
  cn,
  ConfirmDialog,
  ErrorState,
  Label,
  LoadingRegion,
  NotFoundScreen,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  TICKET_STATUS_TONES,
  toast,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { dashboardKeys } from '@/features/dashboard';
import { adminDirectoryQuery, lookupKeys } from '@/features/lookups';
import { orderPath, ROUTES } from '@/lib/routes';
import {
  adminSupportKeys,
  adminTicketQuery,
  assignTicket,
  closeTicket,
  isTicketMissing,
  resolveTicket,
  type AdminTicket,
} from '../api';
import { SUPPORT_COPY as COPY } from '../copy';

const LINK_CLASS = 'text-primary underline-offset-4 hover:underline';

/** Statuses an admin can resolve from [SPEC 16]: anything open or waiting. */
const RESOLVABLE: readonly TicketStatus[] = ['open', 'awaiting_admin', 'awaiting_user'];

/** Refusals that mean the ticket changed under the action: read it again (spec 03 AD-29). */
const STALE_CODES = [
  'SUPPORT_TICKET_INVALID_STATUS_TRANSITION',
  'SUPPORT_TICKET_CLOSED',
  'SUPPORT_TICKET_NOT_FOUND',
] as const;

export interface TicketDetailProps {
  readonly ticketId: string;
  readonly currentUserId: string;
}

/** AD-29 Ticket: header with assignment, SLA and actions; the thread with internal notes; Reply / Internal note. */
export function TicketDetail({ ticketId, currentUserId }: TicketDetailProps) {
  const ticket = useQuery({ ...adminTicketQuery(ticketId), refetchOnWindowFocus: true });
  useTicketRoom(ticketId, { onNotFound: () => void ticket.refetch() });

  if (ticket.isError) {
    if (isTicketMissing(ticket.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.support} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToTickets}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.ticketTitle} />
        <ErrorState
          message={COPY.ticketLoadFailed}
          onRetry={() => void ticket.refetch()}
          correlationId={isApiError(ticket.error) ? (ticket.error.correlationId ?? undefined) : undefined}
        />
      </div>
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
  return <TicketContent ticket={ticket.data} currentUserId={currentUserId} />;
}

/** After an action or a stale refusal: the ticket, every list and the dashboard figures read again. */
function useTicketWrite(ticket: AdminTicket) {
  const queryClient = useQueryClient();
  const refreshAround = () => {
    void queryClient.invalidateQueries({ queryKey: adminSupportKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all() });
  };
  return {
    done: (updated: AdminTicket) => {
      queryClient.setQueryData(adminSupportKeys.detail(ticket.id), updated);
      refreshAround();
    },
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: adminSupportKeys.detail(ticket.id) });
      void queryClient.invalidateQueries({ queryKey: adminSupportKeys.messages(ticket.id) });
      refreshAround();
    },
    /** A refusal the screen explains; false for anything else. */
    handled: (error: unknown, refresh: () => void): boolean => {
      if (STALE_CODES.some((code) => isApiError(error, code))) {
        refresh();
        toast({ title: COPY.changed, tone: 'destructive' });
        return true;
      }
      if (isApiError(error, 'SUPPORT_ASSIGNEE_INVALID')) {
        void queryClient.invalidateQueries({ queryKey: lookupKeys.adminDirectory() });
        toast({ title: COPY.assigneeInvalid, tone: 'destructive' });
        return true;
      }
      return false;
    },
  };
}

function TicketContent({
  ticket,
  currentUserId,
}: {
  readonly ticket: AdminTicket;
  readonly currentUserId: string;
}) {
  const write = useTicketWrite(ticket);
  const { messages, list } = useThreadMessages(ticket.id);
  useMarkRead(ticket.id, list.at(-1)?.id ?? null);
  const typing = useOtherSideTyping(ticket.id);
  const reconnecting = useReconnecting();
  const [sent, setSent] = useState(0);
  const [pending, setPending] = useState<'assign' | 'unassign' | 'resolve' | null>(null);
  const [dialog, setDialog] = useState<'assign' | 'close' | null>(null);
  const closed = ticket.status === 'closed';
  const mine = ticket.assignedAdmin?.userId === currentUserId;

  const run = async (
    kind: 'assign' | 'unassign' | 'resolve',
    action: () => Promise<AdminTicket>,
    ok: string,
  ) => {
    setPending(kind);
    try {
      write.done(await action());
      toast({ title: ok, tone: 'success' });
    } catch (error) {
      if (!write.handled(error, write.refresh)) toast({ title: errorMessage(error), tone: 'destructive' });
    } finally {
      setPending(null);
    }
  };

  let sla: string = COPY.none;
  if (ticket.slaBreachedAt !== null) sla = COPY.slaMissed(formatDateTime(ticket.slaBreachedAt));
  else if (ticket.awaitingAdminSince !== null)
    sla = COPY.slaWaiting(formatDateTime(ticket.awaitingAdminSince));

  return (
    <div className="space-y-6">
      <PageHeader
        title={ticket.subject}
        description={`${COPY.ticket(ticket.ticketNumber)} · ${TICKET_CATEGORY_LABELS[ticket.category]}`}
        actions={
          <StatusBadge
            value={ticket.status}
            labels={TICKET_STATUS_LABELS.admin}
            tones={TICKET_STATUS_TONES}
          />
        }
      />
      <dl aria-label={COPY.detailsLabel} className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">{COPY.openedBy}</dt>
        <dd>
          {ticket.opener.displayName} ·{' '}
          {COPY.openerLine(USER_ROLE_LABELS[ticket.opener.role], ticket.opener.email)}
        </dd>
        {ticket.order === null ? null : (
          <>
            <dt className="text-muted-foreground">{COPY.order}</dt>
            <dd>
              <Link href={orderPath(ticket.order.id)} className={LINK_CLASS}>
                {COPY.orderLink(ticket.order.orderNumber)}
              </Link>
            </dd>
          </>
        )}
        {ticket.order === null && ticket.sellerOrderId !== null ? (
          <>
            <dt className="text-muted-foreground">{COPY.sellerOrder}</dt>
            <dd>{ticket.sellerOrderId.slice(0, 8)}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{COPY.assignedTo}</dt>
        <dd>
          {ticket.assignedAdmin === null
            ? COPY.unassigned
            : `${ticket.assignedAdmin.displayName}${mine ? ` (${COPY.you})` : ''}`}
        </dd>
        <dt className="text-muted-foreground">{COPY.sla}</dt>
        <dd>{sla}</dd>
      </dl>
      {closed ? null : (
        <div role="group" aria-label={COPY.actionsLabel} className="flex flex-wrap gap-2">
          {mine ? null : (
            <Button
              variant="outline"
              size="sm"
              loading={pending === 'assign'}
              onClick={() =>
                void run('assign', () => assignTicket(ticket.id, currentUserId), COPY.assignedToast(COPY.you))
              }
            >
              {COPY.assignToMe}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDialog('assign');
            }}
          >
            {COPY.assign}
          </Button>
          {ticket.assignedAdmin === null ? null : (
            <Button
              variant="outline"
              size="sm"
              loading={pending === 'unassign'}
              onClick={() => void run('unassign', () => assignTicket(ticket.id, null), COPY.unassignedToast)}
            >
              {COPY.unassign}
            </Button>
          )}
          {RESOLVABLE.includes(ticket.status) ? (
            <Button
              variant="outline"
              size="sm"
              loading={pending === 'resolve'}
              onClick={() => void run('resolve', () => resolveTicket(ticket.id), COPY.resolvedToast)}
            >
              {COPY.resolve}
            </Button>
          ) : null}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setDialog('close');
            }}
          >
            {COPY.close}
          </Button>
        </div>
      )}

      <MessageViewport
        list={list}
        placeholder={messagesPlaceholder(messages)}
        reconnecting={reconnecting}
        sent={sent}
        hasEarlier={messages.hasNextPage}
        loadingEarlier={messages.isFetchingNextPage}
        onLoadEarlier={() => void messages.fetchNextPage()}
        onImageExpired={() => void messages.refetch()}
      />
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {typing ? COPY.userTyping(ticket.opener.displayName) : ''}
      </p>

      <ComposerTabs
        ticket={ticket}
        onStale={write.refresh}
        onSent={() => {
          setSent((count) => count + 1);
        }}
      />

      {dialog === 'assign' ? (
        <AssignDialog
          ticket={ticket}
          onClose={() => {
            setDialog(null);
          }}
          onAssign={(adminUserId, name) =>
            run('assign', () => assignTicket(ticket.id, adminUserId), COPY.assignedToast(name))
          }
        />
      ) : null}
      <ConfirmDialog
        open={dialog === 'close'}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        title={COPY.closeTitle}
        description={COPY.closeConfirm}
        confirmLabel={COPY.closeConfirmLabel}
        destructive
        onConfirm={async () => {
          try {
            write.done(await closeTicket(ticket.id));
            toast({ title: COPY.closedToast });
          } catch (error) {
            if (!write.handled(error, write.refresh))
              toast({ title: errorMessage(error), tone: 'destructive' });
          }
        }}
      />
    </div>
  );
}

type ComposerTab = 'reply' | 'note';
const TABS: readonly ComposerTab[] = ['reply', 'note'];

/**
 * Reply / Internal note (AD-Q-13): two composers, each keeping its draft while the other is shown. The note tab
 * has a distinct background and "Add note"; a closed ticket takes notes only.
 */
function ComposerTabs({
  ticket,
  onStale,
  onSent,
}: {
  readonly ticket: AdminTicket;
  readonly onStale: () => void;
  readonly onSent: () => void;
}) {
  const closed = ticket.status === 'closed';
  const [tab, setTab] = useState<ComposerTab>(closed ? 'note' : 'reply');
  const current: ComposerTab = closed ? 'note' : tab;
  const idPrefix = useId();
  const tabRefs = useRef<Partial<Record<ComposerTab, HTMLButtonElement | null>>>({});
  const available = closed ? (['note'] as const) : TABS;
  const label = (value: ComposerTab) => (value === 'reply' ? COPY.replyTab : COPY.noteTab);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = available.indexOf(current);
    const next =
      available[(index + (event.key === 'ArrowRight' ? 1 : available.length - 1)) % available.length];
    if (next === undefined) return;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="space-y-3">
      {closed ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{COPY.closedNoReply}</p> : null}
      <div role="tablist" aria-label={COPY.composerTabs} className="flex gap-2 border-b border-border">
        {available.map((value) => (
          <button
            key={value}
            ref={(element) => {
              tabRefs.current[value] = element;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${value}-tab`}
            aria-selected={current === value}
            aria-controls={`${idPrefix}-${value}-panel`}
            tabIndex={current === value ? 0 : -1}
            onClick={() => {
              setTab(value);
            }}
            onKeyDown={onKeyDown}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring',
              current === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground',
            )}
          >
            {label(value)}
          </button>
        ))}
      </div>
      {closed ? null : (
        <TabPanel id={`${idPrefix}-reply`} hidden={current !== 'reply'}>
          <Composer
            ticketId={ticket.id}
            onStale={onStale}
            onSent={onSent}
            labels={{ field: COPY.replyLabel }}
          />
          {ticket.assignedAdmin === null ? (
            <p className="text-sm text-muted-foreground">{COPY.replyAssigns}</p>
          ) : null}
        </TabPanel>
      )}
      <TabPanel
        id={`${idPrefix}-note`}
        hidden={current !== 'note'}
        className="rounded-lg border border-warning bg-warning-muted p-4"
      >
        <Composer
          ticketId={ticket.id}
          internal
          onStale={onStale}
          onSent={onSent}
          labels={{ field: COPY.noteLabel, hint: COPY.noteHint, submit: COPY.addNote }}
        />
      </TabPanel>
    </div>
  );
}

function TabPanel({
  id,
  hidden,
  className,
  children,
}: {
  readonly id: string;
  readonly hidden: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`${id}-panel`}
      aria-labelledby={`${id}-tab`}
      hidden={hidden}
      className={cn('space-y-2', className)}
    >
      {children}
    </div>
  );
}

/** "Assign…": active admins other than the current assignee (spec 03 AD-29). */
function AssignDialog({
  ticket,
  onClose,
  onAssign,
}: {
  readonly ticket: AdminTicket;
  readonly onClose: () => void;
  readonly onAssign: (adminUserId: string, name: string) => Promise<void>;
}) {
  const selectId = useId();
  const directory = useQuery(adminDirectoryQuery());
  const admins = (directory.data ?? []).filter(
    (admin) => admin.status === 'active' && admin.id !== ticket.assignedAdmin?.userId,
  );
  const [chosen, setChosen] = useState('');
  const [missing, setMissing] = useState(false);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.assignTitle}
      description={COPY.assignHelp}
      confirmLabel={COPY.assignConfirm}
      onConfirm={async () => {
        const admin = admins.find((candidate) => candidate.id === chosen);
        if (admin === undefined) {
          setMissing(true);
          throw new Error('invalid');
        }
        await onAssign(admin.id, admin.email);
      }}
    >
      <div className="space-y-1">
        <Label htmlFor={selectId}>{COPY.assignee}</Label>
        <Select
          id={selectId}
          placeholder={COPY.chooseAdmin}
          options={admins.map((admin) => ({ value: admin.id, label: admin.email }))}
          value={chosen}
          disabled={directory.isPending}
          onValueChange={(value) => {
            setChosen(value);
            setMissing(false);
          }}
        />
        {missing ? <p className="text-sm text-destructive">{COPY.chooseAdmin}</p> : null}
      </div>
    </ConfirmDialog>
  );
}
