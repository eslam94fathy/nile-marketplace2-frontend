'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
import {
  ACCOUNT_TYPE_LABELS,
  formatDateTime,
  formatMoney,
  LEDGER_ENTRY_TYPE_LABELS,
  LEDGER_REFERENCE_TYPE_LABELS,
  LEDGER_REFERENCE_TYPES,
} from '@nile/domain';
import {
  Button,
  DataTable,
  EmptyState,
  ErrorState,
  Field,
  Input,
  PageHeader,
  Select,
  type DataTableColumn,
} from '@nile/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { accountPath, ROUTES } from '@/lib/routes';
import { accountQuery, referenceQuery, type ReferenceEntry } from '../api';
import { FINANCE_COPY as COPY } from '../copy';
import { parseReference, referenceQueryString, type RawParams, type ReferenceQuery } from '../lib/params';
import { ownerLabel } from './accounts-list';
import { Balance } from './balance';

const schema = z.object({
  referenceType: z.enum(LEDGER_REFERENCE_TYPES),
  referenceId: z.string().trim().pipe(z.uuid(COPY.referenceIdInvalid)),
});
type Values = z.input<typeof schema>;

/** AD-22 Reference lookup: type + id in the URL (`?referenceType=&referenceId=`), then the entries. */
export function ReferenceLookup({ params }: { readonly params: RawParams }) {
  const reference = parseReference(params);
  const router = useRouter();
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: {
      referenceType: reference?.referenceType ?? 'seller_order',
      referenceId: reference?.referenceId ?? '',
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    router.push(`${ROUTES.referenceLookup}?${referenceQueryString(values)}`);
  });

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.lookupTitle} />
      <form
        noValidate
        onSubmit={(event) => void onSubmit(event)}
        className="grid max-w-3xl gap-4 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
      >
        <Field
          control={form.control}
          name="referenceType"
          label={COPY.referenceType}
          required
          render={({ field, controlProps }) => (
            <Select
              {...controlProps}
              options={LEDGER_REFERENCE_TYPES.map((type) => ({
                value: type,
                label: LEDGER_REFERENCE_TYPE_LABELS[type],
              }))}
              value={field.value}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              onBlur={field.onBlur}
            />
          )}
        />
        <Field
          control={form.control}
          name="referenceId"
          label={COPY.referenceId}
          required
          render={({ field, controlProps }) => (
            <Input {...field} {...controlProps} autoComplete="off" spellCheck={false} />
          )}
        />
        <Button type="submit">{COPY.find}</Button>
      </form>
      {reference === null ? (
        <p className="text-sm text-muted-foreground">{COPY.lookupPrompt}</p>
      ) : (
        <Results key={referenceQueryString(reference)} reference={reference} />
      )}
    </div>
  );
}

function Results({ reference }: { readonly reference: ReferenceQuery }) {
  const entries = useQuery(referenceQuery(reference));
  const accountIds = [...new Set((entries.data ?? []).map((entry) => entry.accountId))];
  // At most a handful of entries [SPEC 12]: name each account by its type and owner.
  const accounts = useQueries({
    queries: accountIds.map((accountId) => accountQuery(accountId)),
    combine: (results) =>
      new Map(
        results.flatMap((result) => (result.data === undefined ? [] : [[result.data.id, result.data]])),
      ),
  });

  const columns: readonly DataTableColumn<ReferenceEntry>[] = [
    {
      id: 'account',
      header: COPY.lookupColumns.account,
      cell: (row) => {
        const account = accounts.get(row.accountId);
        return (
          <Link
            href={accountPath(row.accountId)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {account === undefined
              ? COPY.shortId(row.accountId)
              : `${ACCOUNT_TYPE_LABELS[account.accountType]}: ${ownerLabel(account)}`}
          </Link>
        );
      },
    },
    { id: 'type', header: COPY.lookupColumns.type, cell: (row) => LEDGER_ENTRY_TYPE_LABELS[row.entryType] },
    { id: 'direction', header: COPY.lookupColumns.direction, cell: (row) => COPY.directions[row.direction] },
    { id: 'amount', header: COPY.lookupColumns.amount, align: 'end', cell: (row) => formatMoney(row.amount) },
    {
      id: 'balanceAfter',
      header: COPY.lookupColumns.balanceAfter,
      align: 'end',
      cell: (row) => <Balance value={row.balanceAfter} />,
    },
    { id: 'date', header: COPY.lookupColumns.date, cell: (row) => formatDateTime(row.createdAt) },
  ];

  if (entries.isError) {
    return (
      <ErrorState
        message={COPY.lookupFailed}
        onRetry={() => void entries.refetch()}
        correlationId={isApiError(entries.error) ? (entries.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  return (
    <DataTable
      caption={COPY.lookupCaption}
      columns={columns}
      rows={entries.data ?? []}
      getRowId={(row) => row.id}
      loading={entries.isPending}
      empty={<EmptyState title={COPY.lookupEmpty} description={COPY.asyncNote} />}
      hasMore={false}
      loadingMore={false}
      onLoadMore={() => undefined}
    />
  );
}
