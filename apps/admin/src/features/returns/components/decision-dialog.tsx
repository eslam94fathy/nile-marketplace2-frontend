'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { applyServerErrors, useIdempotentMutation } from '@nile/query';
import { Field, Textarea, toast } from '@nile/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { StepDialog, type Step } from '@/components/step-dialog';
import { orderKeys } from '@/features/orders';
import { decideReturn, resolveDispute, returnKeys, type AdminReturn } from '../api';
import { RETURNS_COPY as COPY } from '../copy';

/** `AdminDecideReturnDto.note` / `ResolveDisputeDto.note`: 3..500, trimmed [VERIFIED]. */
const schema = z.object({ note: fields.trimmedString(3, 500) });
type Values = z.input<typeof schema>;

/** The AD-02 figures and cards count returns; the prefix is literal because the dashboard builds on returns. */
const DASHBOARD_PREFIX = ['admin', 'dashboard'] as const;

const FIELD_MAP = { note: { field: 'note', message: fields.FIELD_MESSAGES.tooLong(500) } } as const;

/** The four outcomes an admin can choose on AD-33 (spec 03 §7.6). */
export type ReturnAction = 'approve' | 'reject' | 'refund' | 'no_refund';

const ACTIONS = {
  approve: {
    title: COPY.approveTitle,
    confirm: COPY.approveConfirm,
    summary: COPY.approveSummary,
    done: COPY.decided,
  },
  reject: {
    title: COPY.rejectTitle,
    confirm: COPY.rejectConfirm,
    summary: COPY.rejectSummary,
    done: COPY.decided,
  },
  refund: {
    title: COPY.refundTitle,
    confirm: COPY.refundConfirm,
    summary: COPY.refundSummary,
    done: COPY.resolved,
  },
  no_refund: {
    title: COPY.noRefundTitle,
    confirm: COPY.noRefundConfirm,
    summary: COPY.noRefundSummary,
    done: COPY.resolved,
  },
} as const satisfies Readonly<
  Record<
    ReturnAction,
    {
      title: string;
      confirm: string;
      summary: (returnNumber: string, note: string) => string;
      done: (returnNumber: string) => string;
    }
  >
>;

export interface DecisionDialogProps {
  readonly item: AdminReturn;
  readonly action: ReturnAction;
  readonly onClose: () => void;
}

/**
 * AD-33 Decide / Resolve dispute (spec 03 §7.6): a required note ("Your decision is final."), then a summary to
 * confirm (TM7-Q3). A dispute resolution carries one `Idempotency-Key` per intent (decision + note); a decision
 * has no key and is never retried.
 */
export function DecisionDialog({ item, action, onClose }: DecisionDialogProps) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const [step, setStep] = useState<Step>('form');
  const [note, setNote] = useState<string | null>(null);
  const decide = useMutation({ mutationFn: decideReturn, retry: false });
  const resolve = useIdempotentMutation({
    mutationFn: resolveDispute,
    intentScope: ['admin', 'resolve-dispute', item.id],
  });
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { note: '' },
  });
  const copy = ACTIONS[action];
  const pending = decide.isPending || resolve.isPending;

  const refreshAll = () => {
    for (const queryKey of [returnKeys.all(), DASHBOARD_PREFIX, orderKeys.detail(item.orderId)]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const onContinue = form.handleSubmit((values) => {
    failure.clear();
    setNote(values.note);
    setStep('confirm');
  });

  const onConfirm = async () => {
    if (note === null) return;
    failure.clear();
    try {
      const updated =
        action === 'approve' || action === 'reject'
          ? await decide.mutateAsync({ returnId: item.id, decision: action, note })
          : await resolve.mutateAsync({ returnId: item.id, decision: action, note });
      queryClient.setQueryData(returnKeys.detail(item.id), updated);
      refreshAll();
      toast({ title: copy.done(item.returnNumber), tone: 'success' });
      onClose();
    } catch (error) {
      if (isApiError(error, 'RETURN_INVALID_STATUS_TRANSITION') || isApiError(error, 'RETURN_NOT_FOUND')) {
        refreshAll();
        toast({ title: COPY.changed, tone: 'destructive' });
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
      title={copy.title}
      confirmTitle={COPY.confirmTitle}
      step={step}
      summary={note === null ? '' : copy.summary(item.returnNumber, note)}
      confirmLabel={copy.confirm}
      pending={pending}
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
          // Enter in the note must not submit: "Continue" moves on.
          event.preventDefault();
        }}
      >
        <Field
          control={form.control}
          name="note"
          label={COPY.note}
          description={COPY.noteHint}
          required
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </StepDialog>
  );
}
