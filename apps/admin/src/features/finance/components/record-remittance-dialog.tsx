'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatMoney, moneyGreaterThan } from '@nile/domain';
import { applyServerErrors, useIdempotentMutation } from '@nile/query';
import { Field, Input, Notice, Select, Textarea, toast } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { agentKeys, agentPickerQuery } from '@/features/lookups';
import { createRemittance, financeKeys, ownerAccountQuery, type CreateRemittanceBody } from '../api';
import { FINANCE_COPY as COPY } from '../copy';
import { StepDialog, type Step } from '@/components/step-dialog';

/** `CreateRemittanceDto` [VERIFIED]: amount > 0, note optional 1..500 (omitted when empty). */
const schema = z.object({
  agentId: z.string().min(1, fields.FIELD_MESSAGES.required),
  amount: fields.positiveMoney,
  note: fields.nullableTrimmedString(1, 500),
});
type Values = z.input<typeof schema>;

const FIELD_MAP = {
  agentId: { field: 'agentId', message: fields.FIELD_MESSAGES.required },
  amount: { field: 'amount', message: fields.FIELD_MESSAGES.positiveMoney },
  note: { field: 'note', message: fields.FIELD_MESSAGES.tooLong(500) },
} as const;

const ZERO = '0.00';
const isMoney = (value: string) => fields.positiveMoney.safeParse(value).success;

export interface RecordRemittanceDialogProps {
  /** AD-20 prefilled from `?agent=` (AD-11, AD-18, the dashboard). */
  readonly initialAgentId: string | null;
  readonly onClose: () => void;
}

/**
 * AD-20 "Record cash received": agent, amount (warned above the agent's COD cash; the backend enforces it),
 * optional note; a summary to confirm; one `Idempotency-Key` per intent, reused on retry.
 */
export function RecordRemittanceDialog({ initialAgentId, onClose }: RecordRemittanceDialogProps) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const [notice, setNotice] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('form');
  const [body, setBody] = useState<CreateRemittanceBody | null>(null);
  const mutation = useIdempotentMutation({ mutationFn: createRemittance });
  const agents = useQuery(agentPickerQuery());
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { agentId: initialAgentId ?? '', amount: '', note: '' },
  });
  const agentId = useWatch({ control: form.control, name: 'agentId' });
  const amount = useWatch({ control: form.control, name: 'amount' });
  const cash = useQuery({ ...ownerAccountQuery(agentId, 'agent_cod_cash'), enabled: agentId !== '' });
  const balance = cash.data === undefined ? null : (cash.data?.balance ?? ZERO);
  const agentName = (id: string) =>
    agents.data?.find((agent) => agent.id === id)?.fullName ?? COPY.shortId(id);

  const onContinue = form.handleSubmit((values) => {
    failure.clear();
    setNotice(null);
    setBody({
      agentId: values.agentId,
      amount: values.amount,
      ...(values.note === null ? {} : { note: values.note }),
    });
    setStep('confirm');
  });

  const onConfirm = async () => {
    if (body === null) return;
    failure.clear();
    try {
      const remittance = await mutation.mutateAsync(body);
      void queryClient.invalidateQueries({ queryKey: financeKeys.all() });
      void queryClient.invalidateQueries({ queryKey: financeKeys.dashboard() });
      void queryClient.invalidateQueries({ queryKey: agentKeys.detail(remittance.agentId) });
      toast({
        title: COPY.cashRecorded(formatMoney(remittance.amount), agentName(remittance.agentId)),
        tone: 'success',
      });
      onClose();
    } catch (error) {
      if (isApiError(error, 'REMITTANCE_EXCEEDS_BALANCE')) {
        // The message carries the balance as text only: read it again instead (errors by code).
        const fresh = await cash.refetch();
        setNotice(COPY.agentHoldsOnly(formatMoney(fresh.data?.balance ?? ZERO)));
        setStep('form');
        return;
      }
      if (isApiError(error, 'AGENT_NOT_FOUND')) {
        void agents.refetch();
        form.setError('agentId', { type: 'server', message: COPY.agentGone });
        setStep('form');
        return;
      }
      if (applyServerErrors(error, form.setError, FIELD_MAP)) {
        setStep('form');
        return;
      }
      failure.fail(error);
    }
  };

  const options = (agents.data ?? []).map((agent) => ({ value: agent.id, label: agent.fullName }));
  if (initialAgentId !== null && !options.some((option) => option.value === initialAgentId)) {
    options.unshift({ value: initialAgentId, label: COPY.shortId(initialAgentId) });
  }

  return (
    <StepDialog
      title={COPY.cashTitle}
      confirmTitle={COPY.cashConfirmTitle}
      step={step}
      summary={body === null ? '' : COPY.cashConfirm(formatMoney(body.amount), agentName(body.agentId))}
      confirmLabel={COPY.cashTitle}
      pending={mutation.isPending}
      failure={{ message: failure.message ?? notice, correlationId: failure.correlationId }}
      onContinue={() => void onContinue()}
      onBack={() => {
        failure.clear();
        setStep('form');
      }}
      onConfirm={() => void onConfirm()}
      onClose={onClose}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onContinue();
        }}
      >
        <Field
          control={form.control}
          name="agentId"
          label={COPY.agent}
          required
          render={({ field, controlProps }) => (
            <Select
              {...controlProps}
              options={options}
              placeholder={COPY.agentPlaceholder}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              disabled={agents.isPending}
            />
          )}
        />
        {balance === null ? null : (
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {moneyGreaterThan(balance, ZERO) ? COPY.holds(formatMoney(balance)) : COPY.holdsNothing}
          </p>
        )}
        <Field
          control={form.control}
          name="amount"
          label={COPY.amount}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="decimal" />}
        />
        {balance !== null && isMoney(amount) && moneyGreaterThan(amount.trim(), balance) ? (
          <Notice>{COPY.aboveCash}</Notice>
        ) : null}
        <Field
          control={form.control}
          name="note"
          label={COPY.note}
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={2} />}
        />
      </form>
    </StepDialog>
  );
}
