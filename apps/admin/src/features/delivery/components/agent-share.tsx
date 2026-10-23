'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDateTime, formatRatePercent, ratePercentValue } from '@nile/domain';
import { Button, ConfirmDialog, ErrorState, Field, FormAlert, Input, Skeleton, toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { deliveryKeys, deliverySettingsQuery, setAgentFeeShareRate, type DeliverySettings } from '../api';
import { DELIVERY_COPY as COPY } from '../copy';

const schema = z.object({ rate: fields.percentRate });

/** AD-08 item 1: the agent's share of the delivery fee, changed after a confirmation [SPEC 11 UC-DE-7]. */
export function AgentShare() {
  const settings = useQuery(deliverySettingsQuery());
  let body;
  if (settings.isError) {
    body = (
      <ErrorState
        message={COPY.shareLoadFailed}
        onRetry={() => void settings.refetch()}
        correlationId={isApiError(settings.error) ? (settings.error.correlationId ?? undefined) : undefined}
      />
    );
  } else if (settings.data === undefined) {
    body = <Skeleton className="h-40" />;
  } else {
    body = <ShareForm key={settings.data.updatedAt} settings={settings.data} />;
  }
  return (
    <section aria-labelledby="agent-share-heading" className="max-w-md space-y-4">
      <h2 id="agent-share-heading" className="text-lg font-semibold">
        {COPY.shareHeading}
      </h2>
      {body}
    </section>
  );
}

function ShareForm({ settings }: { readonly settings: DeliverySettings }) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const [pending, setPending] = useState<string | null>(null);
  const form = useForm<{ rate: string }, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { rate: ratePercentValue(settings.agentFeeShareRate) },
  });

  const onSubmit = form.handleSubmit(({ rate }) => {
    failure.clear();
    setPending(rate);
  });

  const save = async () => {
    if (pending === null) return;
    try {
      const updated = await setAgentFeeShareRate(pending);
      queryClient.setQueryData(deliveryKeys.settings(), updated);
      toast({ title: COPY.shareSaved(formatRatePercent(updated.agentFeeShareRate)), tone: 'success' });
    } catch (error) {
      failure.fail(error);
    }
  };

  return (
    <div className="space-y-4">
      <dl className="space-y-1">
        <dt className="text-sm text-muted-foreground">{COPY.shareCurrent}</dt>
        <dd className="text-2xl font-semibold">{formatRatePercent(settings.agentFeeShareRate)}</dd>
        <dd className="text-sm text-muted-foreground">
          {COPY.shareUpdated(formatDateTime(settings.updatedAt))}
        </dd>
      </dl>
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-3">
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="rate"
          label={COPY.shareRate}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="decimal" />}
        />
        <Button type="submit" disabled={failure.blocked}>
          {COPY.shareSave}
        </Button>
      </form>
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={COPY.shareConfirmTitle}
        description={pending === null ? '' : COPY.shareConfirm(formatRatePercent(pending))}
        confirmLabel={COPY.shareSave}
        onConfirm={save}
      />
    </div>
  );
}
