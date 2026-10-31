'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatMoney } from '@nile/domain';
import { applyServerErrors, useIdempotentMutation } from '@nile/query';
import { Field, Input, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { StepDialog, type Step } from '@/components/step-dialog';
import { paymentKeys, recordRefund, type RefundDetail } from '../api';
import { PAYMENTS_COPY as COPY } from '../copy';

/** `RecordRefundDto.providerRefundRef`: 1..100 characters, trimmed [VERIFIED]. */
const schema = z.object({ providerRefundRef: fields.trimmedString(1, 100) });

const FIELD_MAP = {
  providerRefundRef: { field: 'providerRefundRef', message: fields.FIELD_MESSAGES.tooLong(100) },
} as const;

/**
 * Orders and returns show their refunds; the prefixes are literal because both features build on payments
 * (AD-15 payment summary, AD-33 refund status).
 */
const ORDERS_PREFIX = ['admin', 'orders'] as const;
const RETURNS_PREFIX = ['admin', 'returns'] as const;

/** After a record or a retry (or news that it can't be): every view of refunds and payments reads again. */
export function useRefundRefresh() {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      paymentKeys.refundLists(),
      paymentKeys.refundDetails(),
      paymentKeys.details(),
      ORDERS_PREFIX,
      RETURNS_PREFIX,
      paymentKeys.dashboard(),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

export interface RecordRefundDialogProps {
  readonly refund: RefundDetail;
  /** The instruction and the reference depend on how the customer is paid back (spec 03 AD-34). */
  readonly instruction: string;
  readonly referenceLabel: string;
  readonly onClose: () => void;
}

/**
 * AD-34 "Record refund" (spec 03 §7.6): the instruction to pay first, the reference, then a summary to confirm
 * (AD-Q-5); one idempotency key per intent (refund + reference), reused when the same intent is retried, so it
 * is never recorded twice.
 */
export function RecordRefundDialog({
  refund,
  instruction,
  referenceLabel,
  onClose,
}: RecordRefundDialogProps) {
  const failure = useSubmitFailure();
  const refresh = useRefundRefresh();
  const [step, setStep] = useState<Step>('form');
  const [reference, setReference] = useState<string | null>(null);
  const mutation = useIdempotentMutation({
    mutationFn: recordRefund,
    intentScope: ['admin', 'refund-record', refund.id],
  });
  const amount = formatMoney(refund.amount);
  const form = useForm<{ providerRefundRef: string }, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { providerRefundRef: '' },
  });

  const onContinue = form.handleSubmit((values) => {
    failure.clear();
    setReference(values.providerRefundRef);
    setStep('confirm');
  });

  const onConfirm = async () => {
    if (reference === null) return;
    failure.clear();
    try {
      await mutation.mutateAsync({ refundId: refund.id, providerRefundRef: reference });
      refresh();
      toast({ title: COPY.recorded(amount), tone: 'success' });
      onClose();
    } catch (error) {
      if (isApiError(error, 'REFUND_ALREADY_RECORDED') || isApiError(error, 'REFUND_NOT_FOUND')) {
        refresh();
        toast({
          title: isApiError(error, 'REFUND_NOT_FOUND') ? COPY.refundGone : COPY.alreadyRecorded,
          tone: 'destructive',
        });
        onClose();
        return;
      }
      if (applyServerErrors(error, form.setError, FIELD_MAP)) {
        setStep('form');
        return;
      }
      failure.fail(error);
    }
  };

  return (
    <StepDialog
      title={COPY.recordTitle(amount)}
      confirmTitle={COPY.recordConfirmTitle}
      step={step}
      summary={reference === null ? '' : COPY.recordSummary(amount, reference)}
      confirmLabel={COPY.recordConfirm}
      pending={mutation.isPending}
      failure={{ message: failure.message, correlationId: failure.correlationId }}
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
          // Enter must not submit: "Continue" moves on.
          event.preventDefault();
        }}
      >
        <p className="text-sm">{instruction}</p>
        <Field
          control={form.control}
          name="providerRefundRef"
          label={referenceLabel}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
        />
      </form>
    </StepDialog>
  );
}
