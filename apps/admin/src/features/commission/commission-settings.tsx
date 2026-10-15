'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError, unwrap } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDateTime, formatRatePercent, ratePercentValue } from '@nile/domain';
import { queryKey } from '@nile/query';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Field,
  FormAlert,
  Input,
  PageHeader,
  Skeleton,
  toast,
} from '@nile/ui';
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { browserApi } from '@/lib/browser-api';

// AD-06 Default commission (spec 03): the rate new sellers get; existing sellers keep theirs [SPEC 05].

type Settings = Awaited<ReturnType<typeof fetchSettings>>;

export const COMMISSION_COPY = {
  title: 'Default commission',
  current: 'Default rate for new sellers',
  updated: (date: string) => `Last changed ${date}`,
  loadFailed: "The commission setting couldn't be loaded.",
  rate: 'New default rate (%)',
  save: 'Save default rate',
  confirmTitle: 'Change the default commission',
  confirm: (percent: string) =>
    `Set the default commission to ${percent}? Applies to sellers who register from now on. Existing sellers keep their own rate.`,
  saved: (percent: string) => `The default commission is now ${percent}.`,
} as const;

const COPY = COMMISSION_COPY;

export const commissionKeys = { settings: () => queryKey('admin', 'settings', 'commission') };

async function fetchSettings(signal?: AbortSignal) {
  return (
    await unwrap(browserApi.GET('/api/v1/admin/settings/commission', { ...(signal ? { signal } : {}) }))
  ).data;
}

function settingsQuery() {
  return queryOptions({
    queryKey: commissionKeys.settings(),
    queryFn: ({ signal }) => fetchSettings(signal),
    staleTime: 0,
  });
}

const schema = z.object({ rate: fields.percentRate });

/** AD-06: shows the current default and changes it after a confirmation (it affects future sellers only). */
export function CommissionSettings() {
  const settings = useQuery(settingsQuery());
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      {settings.isError ? (
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void settings.refetch()}
          correlationId={isApiError(settings.error) ? (settings.error.correlationId ?? undefined) : undefined}
        />
      ) : settings.data === undefined ? (
        <Skeleton className="h-40 max-w-md" />
      ) : (
        <SettingsForm key={settings.data.updatedAt} settings={settings.data} />
      )}
    </div>
  );
}

function SettingsForm({ settings }: { readonly settings: Settings }) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const [pending, setPending] = useState<string | null>(null);
  const form = useForm<{ rate: string }, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { rate: ratePercentValue(settings.defaultCommissionRate) },
  });

  const onSubmit = form.handleSubmit(({ rate }) => {
    failure.clear();
    setPending(rate);
  });

  const save = async () => {
    if (pending === null) return;
    try {
      const updated = (
        await unwrap(
          browserApi.PUT('/api/v1/admin/settings/commission', { body: { defaultCommissionRate: pending } }),
        )
      ).data;
      queryClient.setQueryData(commissionKeys.settings(), updated);
      toast({ title: COPY.saved(formatRatePercent(updated.defaultCommissionRate)), tone: 'success' });
    } catch (error) {
      failure.fail(error);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <dl className="space-y-1">
        <dt className="text-sm text-muted-foreground">{COPY.current}</dt>
        <dd className="text-2xl font-semibold">{formatRatePercent(settings.defaultCommissionRate)}</dd>
        <dd className="text-sm text-muted-foreground">{COPY.updated(formatDateTime(settings.updatedAt))}</dd>
      </dl>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-3">
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="rate"
          label={COPY.rate}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="decimal" />}
        />
        <Button type="submit" disabled={failure.blocked}>
          {COPY.save}
        </Button>
      </form>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={COPY.confirmTitle}
        description={pending === null ? '' : COPY.confirm(formatRatePercent(pending))}
        confirmLabel={COPY.save}
        onConfirm={save}
      />
    </div>
  );
}
