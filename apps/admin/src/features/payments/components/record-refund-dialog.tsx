'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatMoney } from '@nile/domain';
import { applyServerErrors, useIdempotentMutation } from '@nile/query';
import { ConfirmDialog, Field, FormAlert, Input, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { paymentKeys, recordRefund, type Refund } from '../api';
import { PAYMENTS_COPY as COPY } from '../copy';

/** `RecordRefundDto.providerRefundRef`: 1..100 characters, trimmed [VERIFIED]. */
const schema = z.object({ providerRefundRef: fields.trimmedString(1, 100) });

const FIELD_MAP = {
  providerRefundRef: { field: 'providerRefundRef', message: fields.FIELD_MESSAGES.tooLong(100) },
} as const;

/** After a record (or news that it can't be): every view of refunds and payments reads again. */
export function useRefundRefresh() {
  const queryClient = useQueryClient();
  return () => {
    for (const queryKey of [
      paymentKeys.refundLists(),
      paymentKeys.details(),
      paymentKeys.orderPayments(),
      paymentKeys.dashboard(),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };
}

export interface RecordRefundDialogProps {
  readonly refund: Refund;
  readonly onClose: () => void;
}

/**
 * AD-16 "Record refund": the instruction to refund in Kashier first is always shown; one idempotency key per
 * intent (refund + reference), reused when the same intent is retried, so it is never recorded twice.
 */
export function RecordRefundDialog({ refund, onClose }: RecordRefundDialogProps) {
  const failure = useSubmitFailure();
  const refresh = useRefundRefresh();
  const mutation = useIdempotentMutation({ mutationFn: recordRefund });
  const amount = formatMoney(refund.amount);
  const form = useForm<{ providerRefundRef: string }, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { providerRefundRef: '' },
  });

  const confirm = async () => {
    failure.clear();
    let reference: string | undefined;
    await form.handleSubmit((values) => {
      reference = values.providerRefundRef;
    })();
    if (reference === undefined) throw new Error('invalid');
    try {
      await mutation.mutateAsync({ refundId: refund.id, providerRefundRef: reference });
    } catch (error) {
      if (isApiError(error, 'REFUND_ALREADY_RECORDED') || isApiError(error, 'REFUND_NOT_FOUND')) {
        refresh();
        toast({
          title: isApiError(error, 'REFUND_NOT_FOUND') ? COPY.refundGone : COPY.alreadyRecorded,
          tone: 'destructive',
        });
        return;
      }
      if (!applyServerErrors(error, form.setError, FIELD_MAP)) failure.fail(error);
      throw error;
    }
    refresh();
    toast({ title: COPY.recorded(amount), tone: 'success' });
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.recordFor(amount)}
      description={COPY.recordInstruction(amount)}
      confirmLabel={COPY.recordConfirm}
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter must not submit: the dialog's button confirms and tracks the pending state.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="providerRefundRef"
          label={COPY.reference}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} autoComplete="off" />}
        />
      </form>
    </ConfirmDialog>
  );
}
