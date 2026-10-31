'use client';

import { isApiError } from '@nile/api';
import {
  AUDIT_ACTION_AREAS,
  AUDIT_ACTION_LABELS,
  AUDIT_TARGET_TYPE_LABELS,
  AUDIT_TARGET_TYPES,
  formatDateTime,
  type AuditAction,
} from '@nile/domain';
import {
  Button,
  buttonVariants,
  Checkbox,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Label,
  PageHeader,
  Select,
  type DataTableColumn,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { adminDirectoryQuery } from '@/features/lookups';
import { auditEntryPath, ROUTES } from '@/lib/routes';
import { auditListOptions, type AuditEntry } from '../api';
import { AUDIT_COPY as COPY } from '../copy';
import {
  auditFiltersQuery,
  hasAuditFilters,
  isUuid,
  parseAuditFilters,
  type AuditFilters,
  type RawAuditParams,
} from '../lib/list-params';
import { actorText, TargetText } from './entry-parts';

const ANY = 'any';
const LINK = 'text-primary underline-offset-4 hover:underline';

const listHref = (filters: AuditFilters): Route => {
  const query = auditFiltersQuery(filters);
  return query === '' ? ROUTES.audit : `${ROUTES.audit}?${query}`;
};

export interface AuditLogProps {
  readonly params: RawAuditParams;
  readonly currentUserId: string;
}

/**
 * AD-38 Audit log: every admin write, newest first; actor, actions, target and created days in the URL. A target
 * scope also comes from the "History" links on the screens of audited things.
 */
export function AuditLog({ params, currentUserId }: AuditLogProps) {
  const filters = parseAuditFilters(params);
  const router = useRouter();
  const entries = useInfiniteQuery(auditListOptions(filters));
  const navigate = (next: AuditFilters, replace = false) => {
    if (replace) router.replace(listHref(next));
    else router.push(listHref(next));
  };

  const columns: readonly DataTableColumn<AuditEntry>[] = [
    {
      id: 'time',
      header: COPY.columns.time,
      cell: (entry) => <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>,
    },
    { id: 'actor', header: COPY.columns.actor, cell: (entry) => actorText(entry, currentUserId) },
    {
      id: 'action',
      header: COPY.columns.action,
      cell: (entry) => (
        <Link href={auditEntryPath(entry.id)} className={`font-medium ${LINK}`}>
          {AUDIT_ACTION_LABELS[entry.action]}
        </Link>
      ),
    },
    {
      id: 'target',
      header: COPY.columns.target,
      cell: (entry) => <TargetText targetType={entry.targetType} targetId={entry.targetId} short />,
    },
    {
      id: 'reason',
      header: COPY.columns.reason,
      // Plain text from an admin, cut by CSS only (CLAUDE.md §7).
      cell: (entry) =>
        entry.reason === null ? null : <span className="line-clamp-2 max-w-sm">{entry.reason}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} description={COPY.description} />
      {entries.isError ? (
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void entries.refetch()}
          correlationId={isApiError(entries.error) ? (entries.error.correlationId ?? undefined) : undefined}
        />
      ) : (
        <DataTable
          caption={COPY.caption}
          columns={columns}
          rows={entries.data?.pages.flatMap((page) => page.data) ?? []}
          getRowId={(entry) => entry.id}
          loading={entries.isPending}
          hasMore={entries.hasNextPage}
          loadingMore={entries.isFetchingNextPage}
          onLoadMore={() => void entries.fetchNextPage()}
          toolbar={
            // Keyed by the URL so the target id field follows Back / Forward and the scope chip.
            <Filters
              key={auditFiltersQuery(filters)}
              filters={filters}
              currentUserId={currentUserId}
              onChange={navigate}
            />
          }
          empty={
            hasAuditFilters(filters) ? (
              <EmptyState
                title={COPY.emptyFiltered}
                action={
                  <Link href={ROUTES.audit} className={buttonVariants({ variant: 'outline' })}>
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
  readonly filters: AuditFilters;
  readonly currentUserId: string;
  readonly onChange: (next: AuditFilters, replace?: boolean) => void;
}

function Filters({ filters, currentUserId, onChange }: FiltersProps) {
  const id = useId();
  const directory = useQuery(adminDirectoryQuery());
  const [targetId, setTargetId] = useState(filters.targetId ?? '');
  const [targetIdError, setTargetIdError] = useState(false);

  // "You" first, then the other admins by email; an actor from the URL that isn't listed keeps a short label.
  const others = (directory.data ?? [])
    .filter((admin) => admin.id !== currentUserId)
    .sort((a, b) => a.email.localeCompare(b.email));
  const actorOptions = [
    { value: ANY, label: COPY.anyActor },
    { value: currentUserId, label: COPY.you },
    ...others.map((admin) => ({ value: admin.id, label: admin.email })),
  ];
  if (filters.actorUserId !== null && !actorOptions.some((option) => option.value === filters.actorUserId)) {
    actorOptions.push({
      value: filters.actorUserId,
      label: COPY.adminShort(COPY.shortId(filters.actorUserId)),
    });
  }

  const setActions = (actions: ReadonlySet<AuditAction>) => {
    onChange({
      ...filters,
      actions: AUDIT_ACTION_AREAS.flatMap((group) => group.actions.filter((action) => actions.has(action))),
    });
  };

  return (
    <div className="mb-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor={`${id}-actor`}>{COPY.actorFilter}</Label>
          <Select
            id={`${id}-actor`}
            options={actorOptions}
            value={filters.actorUserId ?? ANY}
            onValueChange={(value) => {
              onChange({ ...filters, actorUserId: value === ANY ? null : value });
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-from`}>{COPY.from}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            value={filters.from ?? ''}
            max={filters.to ?? undefined}
            onChange={(event) => {
              onChange({ ...filters, from: event.target.value === '' ? null : event.target.value }, true);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-to`}>{COPY.to}</Label>
          <Input
            id={`${id}-to`}
            type="date"
            value={filters.to ?? ''}
            min={filters.from ?? undefined}
            onChange={(event) => {
              onChange({ ...filters, to: event.target.value === '' ? null : event.target.value }, true);
            }}
          />
        </div>
      </div>

      <form
        role="search"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = targetId.trim();
          if (trimmed !== '' && !isUuid(trimmed)) {
            setTargetIdError(true);
            return;
          }
          setTargetIdError(false);
          onChange({ ...filters, targetId: trimmed === '' ? null : trimmed.toLowerCase() });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`${id}-target`}>{COPY.targetFilter}</Label>
          <Select
            id={`${id}-target`}
            options={[
              { value: ANY, label: COPY.anyTarget },
              ...AUDIT_TARGET_TYPES.map((type) => ({ value: type, label: AUDIT_TARGET_TYPE_LABELS[type] })),
            ]}
            value={filters.targetType ?? ANY}
            onValueChange={(value) => {
              const targetType = AUDIT_TARGET_TYPES.find((type) => type === value) ?? null;
              // An id belongs to one type: changing the type drops it.
              onChange({ ...filters, targetType, targetId: null });
            }}
          />
        </div>
        <div className="space-y-1 xl:col-span-2">
          <Label htmlFor={`${id}-target-id`}>{COPY.targetIdLabel}</Label>
          <div className="flex gap-2">
            <Input
              id={`${id}-target-id`}
              value={targetId}
              disabled={filters.targetType === null}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={targetIdError || undefined}
              aria-describedby={`${id}-target-id-hint${targetIdError ? ` ${id}-target-id-error` : ''}`}
              onChange={(event) => {
                setTargetId(event.target.value);
              }}
            />
            <Button type="submit" variant="outline" disabled={filters.targetType === null}>
              {COPY.find}
            </Button>
          </div>
          <p id={`${id}-target-id-hint`} className="text-xs text-muted-foreground">
            {COPY.targetIdHint}
          </p>
          {targetIdError ? (
            <p id={`${id}-target-id-error`} className="text-sm text-destructive">
              {COPY.targetIdInvalid}
            </p>
          ) : null}
        </div>
      </form>

      <details className="rounded-lg border border-border p-3" open={filters.actions.length > 0}>
        <summary className="cursor-pointer text-sm font-medium">
          {COPY.actionFilter}
          {' · '}
          <span className="font-normal text-muted-foreground">
            {filters.actions.length === 0 ? COPY.allActions : COPY.actionsChosen(filters.actions.length)}
          </span>
        </summary>
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {AUDIT_ACTION_AREAS.map((group) => (
              <fieldset key={group.area} className="space-y-2">
                <legend className="text-sm font-medium">{group.label}</legend>
                {group.actions.map((action) => {
                  const checkboxId = `${id}-${action}`;
                  return (
                    <div key={action} className="flex items-center gap-2">
                      <Checkbox
                        id={checkboxId}
                        checked={filters.actions.includes(action)}
                        onCheckedChange={(next) => {
                          const actions = new Set<AuditAction>(filters.actions);
                          if (next === true) actions.add(action);
                          else actions.delete(action);
                          setActions(actions);
                        }}
                      />
                      <Label htmlFor={checkboxId} className="font-normal">
                        {AUDIT_ACTION_LABELS[action]}
                      </Label>
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </div>
          {filters.actions.length === 0 ? null : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActions(new Set());
              }}
            >
              {COPY.clearActions}
            </Button>
          )}
        </div>
      </details>
    </div>
  );
}
