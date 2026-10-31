'use client';

import { isApiError } from '@nile/api';
import { AUDIT_ACTION_LABELS, formatDateTime } from '@nile/domain';
import { Button, buttonVariants, ErrorState, NotFoundScreen, PageHeader, Skeleton, toast } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ROUTES } from '@/lib/routes';
import { auditEntryQuery, isAuditEntryMissing, type AuditEntry } from '../api';
import { AUDIT_COPY as COPY } from '../copy';
import { changeRows, type ChangeRow } from '../lib/changes';
import { actorText, TargetText } from './entry-parts';

export interface AuditEntryDetailProps {
  readonly entryId: string;
  readonly currentUserId: string;
}

/** AD-39 Audit entry: every field, the changes as Field · Before · After (AD-Q-17), ids with Copy buttons. */
export function AuditEntryDetail({ entryId, currentUserId }: AuditEntryDetailProps) {
  const entry = useQuery(auditEntryQuery(entryId));
  if (entry.isError) {
    if (isAuditEntryMissing(entry.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.audit} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToLog}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.entryTitle} />
        <ErrorState
          message={COPY.entryLoadFailed}
          onRetry={() => void entry.refetch()}
          correlationId={isApiError(entry.error) ? (entry.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (entry.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <EntryContent entry={entry.data} currentUserId={currentUserId} />;
}

function EntryContent({
  entry,
  currentUserId,
}: {
  readonly entry: AuditEntry;
  readonly currentUserId: string;
}) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={AUDIT_ACTION_LABELS[entry.action]}
        description={<time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>}
      />
      <dl aria-label={COPY.detailsLabel} className="max-w-3xl space-y-2 text-sm">
        <Row label={COPY.time}>
          <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
        </Row>
        <Row label={COPY.actor}>{actorText(entry, currentUserId)}</Row>
        <Row label={COPY.action}>{AUDIT_ACTION_LABELS[entry.action]}</Row>
        <Row label={COPY.target}>
          <TargetText targetType={entry.targetType} targetId={entry.targetId} />
        </Row>
        {/* Plain text from an admin (CLAUDE.md §7). */}
        {entry.reason === null ? null : (
          <Row label={COPY.reason}>
            <span className="whitespace-pre-line">{entry.reason}</span>
          </Row>
        )}
        {entry.correlationId === null ? null : (
          <Row label={COPY.correlationId}>
            <CopyValue value={entry.correlationId} copyLabel={COPY.copyCorrelationId} />
          </Row>
        )}
        {entry.ip === null ? null : (
          <Row label={COPY.ip}>
            <CopyValue value={entry.ip} copyLabel={COPY.copyIp} />
          </Row>
        )}
      </dl>
      <Changes entry={entry} />
    </div>
  );
}

function Changes({ entry }: { readonly entry: AuditEntry }) {
  const rows = entry.changes === null ? [] : changeRows(entry.changes, entry.targetType);
  return (
    <section aria-labelledby="audit-changes-heading" className="max-w-3xl space-y-3">
      <h2 id="audit-changes-heading" className="text-lg font-semibold">
        {COPY.changes}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{COPY.noChanges}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{COPY.changesCaption}</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {COPY.changeColumns.field}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {COPY.changeColumns.before}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {COPY.changeColumns.after}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field} className="border-t border-border align-top">
                  <th scope="row" className="px-3 py-2 font-normal text-muted-foreground">
                    {row.label}
                  </th>
                  <td className="px-3 py-2 break-all">
                    <ChangeValue value={row.before} />
                  </td>
                  <td className="px-3 py-2 break-all">
                    <ChangeValue value={row.after} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChangeValue({ value }: { readonly value: ChangeRow['before'] }) {
  if (value !== null) return <>{value}</>;
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        —
      </span>
      <span className="sr-only">{COPY.notRecorded}</span>
    </>
  );
}

function CopyValue({ value, copyLabel }: { readonly value: string; readonly copyLabel: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: COPY.copied, tone: 'success' });
    } catch {
      toast({ title: COPY.copyFailed, tone: 'destructive' });
    }
  };
  return (
    <span className="flex flex-wrap items-center gap-3">
      <span className="font-mono break-all">{value}</span>
      <Button variant="outline" size="sm" aria-label={copyLabel} onClick={() => void copy()}>
        {COPY.copy}
      </Button>
    </span>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
