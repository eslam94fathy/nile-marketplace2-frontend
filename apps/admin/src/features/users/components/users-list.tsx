'use client';

import { isApiError } from '@nile/api';
import {
  formatDateTime,
  USER_ROLE_LABELS,
  USER_ROLES,
  USER_STATUS_LABELS,
  USER_STATUSES,
  type UserRole,
} from '@nile/domain';
import {
  Button,
  buttonVariants,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Select,
  StatusBadge,
  USER_STATUS_TONES,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ROUTES } from '@/lib/routes';
import { usersListOptions, type AdminUser } from '../api';
import { ACCOUNT_COPY, USERS_COPY as COPY } from '../copy';
import {
  EMAIL_FILTER_MAX,
  hasUserFilters,
  NO_USER_FILTERS,
  parseUserFilters,
  userFiltersQuery,
  type RawUserParams,
  type UserFilters,
} from '../lib/list-params';
import { ResendInviteDialog, SuspendUserDialog, useReactivate } from './account-actions';

/** As AD-04's name search: the email filter waits for a pause in typing. */
export const EMAIL_SEARCH_DEBOUNCE_MS = 400;
const ALL = 'all';

/** Roles invited by an admin, whose pending invitation can be sent again (AD-Q-10). */
const INVITED_ROLES: readonly UserRole[] = ['admin', 'delivery_agent'];

const listHref = (filters: UserFilters): Route => {
  const query = userFiltersQuery(filters);
  return query === '' ? ROUTES.users : `${ROUTES.users}?${query}`;
};

const dateOrDash = (iso: string | null) => (iso === null ? COPY.never : formatDateTime(iso));

type Dialog = { readonly kind: 'resend' | 'suspend'; readonly user: AdminUser } | null;

export interface UsersListProps {
  readonly params: RawUserParams;
  /** The signed-in admin: no action is ever offered on their own row (AD-Q-10). */
  readonly currentUserId: string;
}

/**
 * AD-24 Users: every account, filtered by role, status, email prefix and created dates (all in the URL). Customers
 * can be suspended and reactivated, invited admins and agents get a new invitation (AD-Q-10).
 */
export function UsersList({ params, currentUserId }: UsersListProps) {
  const filters = parseUserFilters(params);
  const router = useRouter();
  const users = useInfiniteQuery(usersListOptions(filters));
  const [dialog, setDialog] = useState<Dialog>(null);
  const { pendingId, reactivate } = useReactivate();
  const navigate = (next: UserFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };
  const close = () => {
    setDialog(null);
  };

  const actions = (user: AdminUser) => {
    if (user.id === currentUserId) return null;
    if (user.status === 'invited' && INVITED_ROLES.includes(user.role)) {
      return (
        <Button
          variant="outline"
          size="sm"
          aria-label={ACCOUNT_COPY.resendAction(user.email)}
          onClick={() => {
            setDialog({ kind: 'resend', user });
          }}
        >
          {ACCOUNT_COPY.resend}
        </Button>
      );
    }
    if (user.role !== 'customer') return null;
    if (user.status === 'active') {
      return (
        <Button
          variant="outline"
          size="sm"
          aria-label={ACCOUNT_COPY.suspendAction(user.email)}
          onClick={() => {
            setDialog({ kind: 'suspend', user });
          }}
        >
          {ACCOUNT_COPY.suspend}
        </Button>
      );
    }
    if (user.status === 'suspended') {
      return (
        <Button
          variant="outline"
          size="sm"
          aria-label={ACCOUNT_COPY.reactivateAction(user.email)}
          loading={pendingId === user.id}
          onClick={() => void reactivate(user.id, user.email)}
        >
          {ACCOUNT_COPY.reactivate}
        </Button>
      );
    }
    return null;
  };

  const columns: readonly DataTableColumn<AdminUser>[] = [
    {
      id: 'email',
      header: COPY.columns.email,
      cell: (user) => (
        <span className="font-medium">
          {user.email}
          {user.id === currentUserId ? ` ${COPY.you}` : null}
        </span>
      ),
    },
    { id: 'role', header: COPY.columns.role, cell: (user) => USER_ROLE_LABELS[user.role] },
    {
      id: 'status',
      header: COPY.columns.status,
      cell: (user) => (
        <StatusBadge value={user.status} labels={USER_STATUS_LABELS} tones={USER_STATUS_TONES} />
      ),
    },
    { id: 'verified', header: COPY.columns.verified, cell: (user) => dateOrDash(user.emailVerifiedAt) },
    { id: 'lastLogin', header: COPY.columns.lastLogin, cell: (user) => dateOrDash(user.lastLoginAt) },
    { id: 'created', header: COPY.columns.created, cell: (user) => formatDateTime(user.createdAt) },
    { id: 'actions', header: COPY.columns.actions, cell: actions },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} description={COPY.description} />
      {users.isError ? (
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void users.refetch()}
          correlationId={isApiError(users.error) ? (users.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={users.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(user) => user.id}
          loading={users.isPending}
          hasMore={users.hasNextPage}
          loadingMore={users.isFetchingNextPage}
          onLoadMore={() => void users.fetchNextPage()}
          toolbar={<Filters filters={filters} onChange={navigate} />}
          empty={
            hasUserFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link href={listHref(NO_USER_FILTERS)} className={buttonVariants({ variant: 'outline' })}>
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
      {dialog?.kind === 'resend' ? (
        <ResendInviteDialog userId={dialog.user.id} email={dialog.user.email} onClose={close} />
      ) : null}
      {dialog?.kind === 'suspend' ? (
        <SuspendUserDialog
          userId={dialog.user.id}
          email={dialog.user.email}
          title={ACCOUNT_COPY.suspendCustomerTitle}
          description={ACCOUNT_COPY.suspendCustomerConfirm}
          onClose={close}
        />
      ) : null}
    </div>
  );
}

interface FiltersProps {
  readonly filters: UserFilters;
  readonly onChange: (next: UserFilters, replace?: boolean) => void;
}

function Filters({ filters, onChange }: FiltersProps) {
  const roleId = useId();
  const statusId = useId();
  const emailId = useId();
  const fromId = useId();
  const toId = useId();
  const [email, setEmail] = useState(filters.email ?? '');

  // The URL changed from elsewhere (Back, "Clear filters"): show its value (adjusted while rendering).
  const [urlEmail, setUrlEmail] = useState(filters.email);
  if (urlEmail !== filters.email) {
    setUrlEmail(filters.email);
    if (email.trim() !== (filters.email ?? '')) setEmail(filters.email ?? '');
  }

  // The latest filters and callback, read when the timer fires: re-renders must not restart it.
  const latest = useRef({ filters, onChange });
  useEffect(() => {
    latest.current = { filters, onChange };
  });

  useEffect(() => {
    const trimmed = email.trim();
    const next = trimmed === '' ? null : trimmed;
    if (next === filters.email) return undefined;
    const timer = setTimeout(() => {
      latest.current.onChange({ ...latest.current.filters, email: next }, true);
    }, EMAIL_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [email, filters.email]);

  return (
    <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <div className="space-y-1">
        <Label htmlFor={roleId}>{COPY.roleFilter}</Label>
        <Select
          id={roleId}
          options={[
            { value: ALL, label: COPY.allRoles },
            ...USER_ROLES.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] })),
          ]}
          value={filters.role ?? ALL}
          onValueChange={(value) => {
            onChange({ ...filters, role: USER_ROLES.find((role) => role === value) ?? null });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={statusId}>{COPY.statusFilter}</Label>
        <Select
          id={statusId}
          options={[
            { value: ALL, label: COPY.allStatuses },
            ...USER_STATUSES.map((status) => ({ value: status, label: USER_STATUS_LABELS[status] })),
          ]}
          value={filters.status ?? ALL}
          onValueChange={(value) => {
            onChange({ ...filters, status: USER_STATUSES.find((status) => status === value) ?? null });
          }}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={emailId}>{COPY.emailFilter}</Label>
        <Input
          id={emailId}
          type="search"
          inputMode="email"
          autoComplete="off"
          value={email}
          maxLength={EMAIL_FILTER_MAX}
          onChange={(event) => {
            setEmail(event.target.value);
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
  );
}
