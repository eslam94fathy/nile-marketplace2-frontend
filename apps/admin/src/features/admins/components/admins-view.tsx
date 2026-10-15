'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDateTime, USER_STATUS_LABELS } from '@nile/domain';
import { applyServerErrors, errorMessage } from '@nile/query';
import {
  Button,
  buttonVariants,
  cn,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  FormAlert,
  Input,
  PageHeader,
  StatusBadge,
  Textarea,
  toast,
  USER_STATUS_TONES,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ROUTES } from '@/lib/routes';
import {
  adminKeys,
  adminsListOptions,
  inviteAdmin,
  reactivateUser,
  resendInvite,
  suspendUser,
  type AdminListItem,
  type AdminStatus,
} from '../api';
import { ADMINS_COPY as COPY } from '../copy';

/** Status tabs in the URL (`?status=`); no or unknown value is "All". */
export const ADMIN_STATUS_PARAM = 'status';
const TABS = [
  { status: null, label: COPY.tabs.all },
  { status: 'invited', label: COPY.tabs.invited },
  { status: 'active', label: COPY.tabs.active },
  { status: 'suspended', label: COPY.tabs.suspended },
] as const satisfies readonly { status: AdminStatus | null; label: string }[];

export function adminStatusTab(param: string | null): AdminStatus | null {
  return TABS.find((tab) => tab.status === param)?.status ?? null;
}

const tabHref = (status: AdminStatus | null): Route =>
  status === null ? ROUTES.admins : `${ROUTES.admins}?${ADMIN_STATUS_PARAM}=${status}`;

const dateOrDash = (iso: string | null) => (iso === null ? COPY.never : formatDateTime(iso));

type Dialog =
  { readonly kind: 'invite' } | { readonly kind: 'resend' | 'suspend'; readonly admin: AdminListItem } | null;

export interface AdminsViewProps {
  /** `?status=` as received. */
  readonly status: string | null;
  /** The signed-in admin: never offered "Suspend" on their own row (T-H6 acceptance). */
  readonly currentUserId: string;
}

/** AD-03 Admins: list by status, invite, resend invite, suspend (with reason), reactivate. */
export function AdminsView({ status: statusParam, currentUserId }: AdminsViewProps) {
  const status = adminStatusTab(statusParam);
  const queryClient = useQueryClient();
  const admins = useInfiniteQuery(adminsListOptions(status));
  const [dialog, setDialog] = useState<Dialog>(null);
  const [reactivating, setReactivating] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: adminKeys.lists() });
  const close = () => {
    setDialog(null);
  };

  /** Failures shared by the status actions: the account changed meanwhile → refetch and explain. */
  const handleStale = (error: unknown): boolean => {
    if (isApiError(error, 'USER_INVALID_STATUS_TRANSITION') || isApiError(error, 'USER_NOT_FOUND')) {
      void refresh();
      toast({ title: COPY.statusChanged, tone: 'destructive' });
      return true;
    }
    if (isApiError(error, 'CANNOT_SUSPEND_SELF')) {
      void refresh();
      toast({ title: COPY.cannotSuspendSelf, tone: 'destructive' });
      return true;
    }
    return false;
  };

  const reactivate = async (admin: AdminListItem) => {
    setReactivating(admin.id);
    try {
      await reactivateUser(admin.id);
      toast({ title: COPY.reactivated(admin.email), tone: 'success' });
      void refresh();
    } catch (error) {
      if (!handleStale(error)) toast({ title: errorMessage(error), tone: 'destructive' });
    } finally {
      setReactivating(null);
    }
  };

  const actions = (admin: AdminListItem) => (
    <span className="flex flex-wrap gap-2">
      {admin.status === 'invited' ? (
        <Button
          variant="outline"
          size="sm"
          aria-label={COPY.resendAction(admin.email)}
          onClick={() => {
            setDialog({ kind: 'resend', admin });
          }}
        >
          {COPY.resend}
        </Button>
      ) : null}
      {admin.status === 'active' && admin.id !== currentUserId ? (
        <Button
          variant="outline"
          size="sm"
          aria-label={COPY.suspendAction(admin.email)}
          onClick={() => {
            setDialog({ kind: 'suspend', admin });
          }}
        >
          {COPY.suspend}
        </Button>
      ) : null}
      {admin.status === 'suspended' ? (
        <Button
          variant="outline"
          size="sm"
          aria-label={COPY.reactivateAction(admin.email)}
          loading={reactivating === admin.id}
          onClick={() => void reactivate(admin)}
        >
          {COPY.reactivate}
        </Button>
      ) : null}
    </span>
  );

  const columns: readonly DataTableColumn<AdminListItem>[] = [
    {
      id: 'email',
      header: COPY.columns.email,
      cell: (admin) => (
        <span className="font-medium">
          {admin.email}
          {admin.id === currentUserId ? ` ${COPY.you}` : null}
        </span>
      ),
    },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (admin) => (
        <StatusBadge value={admin.status} labels={USER_STATUS_LABELS} tones={USER_STATUS_TONES} />
      ),
    },
    { id: 'verified', header: COPY.columns.verified, cell: (admin) => dateOrDash(admin.emailVerifiedAt) },
    { id: 'lastLogin', header: COPY.columns.lastLogin, cell: (admin) => dateOrDash(admin.lastLoginAt) },
    { id: 'created', header: COPY.columns.created, cell: (admin) => formatDateTime(admin.createdAt) },
    { id: 'actions', header: COPY.columns.actions, cell: actions },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={COPY.title}
        description={COPY.scopeNote}
        actions={
          <Button
            onClick={() => {
              setDialog({ kind: 'invite' });
            }}
          >
            {COPY.invite}
          </Button>
        }
      />
      <nav aria-label={COPY.tabsLabel}>
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <li key={tab.label}>
              <Link
                href={tabHref(tab.status)}
                aria-current={tab.status === status ? 'page' : undefined}
                className={cn(
                  buttonVariants({ variant: tab.status === status ? 'primary' : 'outline', size: 'sm' }),
                )}
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {admins.isError ? (
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void admins.refetch()}
          correlationId={isApiError(admins.error) ? (admins.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={admins.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(admin) => admin.id}
          loading={admins.isPending}
          empty={<EmptyState title={COPY.empty} />}
          hasMore={admins.hasNextPage}
          loadingMore={admins.isFetchingNextPage}
          onLoadMore={() => void admins.fetchNextPage()}
        />
      )}
      {dialog?.kind === 'invite' ? <InviteDialog onClose={close} onInvited={() => void refresh()} /> : null}
      {dialog?.kind === 'resend' ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) close();
          }}
          title={COPY.resendTitle}
          description={COPY.resendConfirm(dialog.admin.email)}
          confirmLabel={COPY.resend}
          onConfirm={async () => {
            try {
              await resendInvite(dialog.admin.id);
              toast({ title: COPY.resent(dialog.admin.email), tone: 'success' });
            } catch (error) {
              if (isApiError(error, 'USER_NOT_INVITED')) {
                void refresh();
                toast({ title: COPY.notInvited, tone: 'destructive' });
                return;
              }
              if (!handleStale(error)) toast({ title: errorMessage(error), tone: 'destructive' });
            }
          }}
        />
      ) : null}
      {dialog?.kind === 'suspend' ? (
        <SuspendDialog
          admin={dialog.admin}
          onClose={close}
          onDone={() => void refresh()}
          handleStale={handleStale}
        />
      ) : null}
    </div>
  );
}

const inviteSchema = z.object({ email: fields.email });
type InviteValues = z.input<typeof inviteSchema>;

function InviteDialog({
  onClose,
  onInvited,
}: {
  readonly onClose: () => void;
  readonly onInvited: () => void;
}) {
  const failure = useSubmitFailure();
  const form = useForm<InviteValues, unknown, z.output<typeof inviteSchema>>({
    resolver: zodResolver(inviteSchema),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });

  const confirm = async () => {
    failure.clear();
    let values: z.output<typeof inviteSchema> | undefined;
    await form.handleSubmit((parsed) => {
      values = parsed;
    })();
    if (values === undefined) throw new Error('invalid');
    try {
      const invited = await inviteAdmin(values.email);
      toast({ title: COPY.invited(invited.email), tone: 'success' });
      onInvited();
    } catch (error) {
      if (isApiError(error, 'EMAIL_ALREADY_REGISTERED')) {
        form.setError('email', { type: 'server', message: COPY.emailTaken });
      } else if (
        !applyServerErrors(error, form.setError, {
          email: { field: 'email', message: fields.FIELD_MESSAGES.email },
        })
      ) {
        failure.fail(error);
      }
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.inviteTitle}
      description={COPY.inviteHelp}
      confirmLabel={COPY.sendInvite}
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter must not submit outside the dialog's button, which tracks the pending state.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="email"
          label={COPY.email}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} type="email" autoComplete="off" inputMode="email" />
          )}
        />
      </form>
    </ConfirmDialog>
  );
}

const suspendSchema = z.object({ reason: fields.trimmedString(3, 500) });
type SuspendValues = z.input<typeof suspendSchema>;

function SuspendDialog({
  admin,
  onClose,
  onDone,
  handleStale,
}: {
  readonly admin: AdminListItem;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly handleStale: (error: unknown) => boolean;
}) {
  const failure = useSubmitFailure();
  const form = useForm<SuspendValues, unknown, z.output<typeof suspendSchema>>({
    resolver: zodResolver(suspendSchema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });

  const confirm = async () => {
    failure.clear();
    let values: z.output<typeof suspendSchema> | undefined;
    await form.handleSubmit((parsed) => {
      values = parsed;
    })();
    if (values === undefined) throw new Error('invalid');
    try {
      await suspendUser(admin.id, values.reason);
      toast({ title: COPY.suspended(admin.email) });
      onDone();
    } catch (error) {
      if (handleStale(error)) return;
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.suspendTitle}
      description={COPY.suspendConfirm(admin.email)}
      confirmLabel={COPY.suspend}
      destructive
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter in the reason must not submit: the dialog's button confirms.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="reason"
          label={COPY.reason}
          required
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </ConfirmDialog>
  );
}
