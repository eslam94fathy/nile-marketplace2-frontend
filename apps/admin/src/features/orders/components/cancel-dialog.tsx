'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { applyServerErrors, useIdempotentMutation } from '@nile/query';
import { Field, Textarea, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { StepDialog, type Step } from '@/components/step-dialog';
import { paymentKeys } from '@/features/payments';
import { cancelAsAdmin, orderKeys, type AdminOrder, type CancelTarget } from '../api';
import { ORDERS_COPY as COPY } from '../copy';

/** `AdminCancelDto.reason`: 3..500, trimmed [VERIFIED]. */
const schema = z.object({ reason: fields.trimmedString(3, 500) });
type Values = z.input<typeof schema>;

const FIELD_MAP = { reason: { field: 'reason', message: fields.FIELD_MESSAGES.tooLong(500) } } as const;

/** Shipments of the order change with a cancel; the prefix is literal because shipments builds on orders. */
const SHIPMENTS_PREFIX = ['admin', 'shipments'] as const;

export interface CancelDialogProps {
  readonly order: AdminOrder;
  /** A seller order of `order`, or the whole order. */
  readonly target: CancelTarget;
  readonly onClose: () => void;
  /** A refusal that names what blocked it (whole order): shown on the page, not in a toast that disappears. */
  readonly onBlocked: (message: string) => void;
}

/**
 * AD-15 A1 / A2 (spec 03 §7.3): a required admin-only reason, then a summary to confirm (§7.4); one
 * `Idempotency-Key` per intent (target + reason), reused when the same intent is retried. The answer is the
 * whole order, which replaces the cached one.
 */
export function CancelDialog({ order, target, onClose, onBlocked }: CancelDialogProps) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure();
  const [step, setStep] = useState<Step>('form');
  const [reason, setReason] = useState<string | null>(null);
  const mutation = useIdempotentMutation({
    mutationFn: cancelAsAdmin,
    intentScope: [
      'admin',
      'cancel',
      target.kind,
      target.kind === 'sellerOrder' ? target.sellerOrderId : order.id,
    ],
  });
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });

  const businessName =
    target.kind === 'sellerOrder'
      ? (order.sellerOrders.find((sellerOrder) => sellerOrder.id === target.sellerOrderId)?.businessName ??
        '')
      : '';
  const isPart = target.kind === 'sellerOrder';
  const consequence = isPart
    ? COPY.cancelPartConsequence(businessName, order.orderNumber)
    : COPY.cancelOrderConsequence(order.orderNumber);

  const refreshAll = () => {
    for (const queryKey of [
      orderKeys.detail(order.id),
      orderKeys.lists(),
      SHIPMENTS_PREFIX,
      paymentKeys.refundLists(),
      paymentKeys.orderPayments(),
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  };

  const onContinue = form.handleSubmit((values) => {
    failure.clear();
    setReason(values.reason);
    setStep('confirm');
  });

  const onConfirm = async () => {
    if (reason === null) return;
    failure.clear();
    try {
      const updated = await mutation.mutateAsync({ target, reason });
      queryClient.setQueryData(orderKeys.detail(order.id), updated);
      refreshAll();
      toast({
        title: isPart ? COPY.partCancelled(businessName) : COPY.orderCancelled(order.orderNumber),
        tone: 'success',
      });
      onClose();
    } catch (error) {
      if (isApiError(error, 'SELLER_ORDER_NOT_CANCELLABLE') || isApiError(error, 'SELLER_ORDER_NOT_FOUND')) {
        refreshAll();
        toast({ title: COPY.partNotCancellable, tone: 'destructive' });
        onClose();
        return;
      }
      if (isApiError(error, 'ORDER_NOT_CANCELLABLE') || isApiError(error, 'ORDER_NOT_FOUND')) {
        refreshAll();
        onBlocked(blockedMessage(order, isApiError(error) ? error.details : []));
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
      title={isPart ? COPY.cancelPartTitle(businessName) : COPY.cancelOrderTitle(order.orderNumber)}
      confirmTitle={COPY.cancelConfirmTitle}
      step={step}
      summary={reason === null ? '' : COPY.cancelSummary(consequence, reason)}
      confirmLabel={isPart ? COPY.cancelPart : COPY.cancelOrder}
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
          // Enter in the reason must not submit: "Continue" moves on.
          event.preventDefault();
        }}
      >
        <p className="text-sm">{consequence}</p>
        <Field
          control={form.control}
          name="reason"
          label={COPY.cancelReasonLabel}
          description={COPY.cancelReasonHint}
          required
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </StepDialog>
  );
}

/**
 * `ORDER_NOT_CANCELLABLE` names each blocking seller order in `details[].value` [VERIFIED backend
 * `orderNotCancellable`]; they are named by business from the order on screen. None means nothing is open.
 */
export function blockedMessage(
  order: AdminOrder,
  details: readonly { readonly value?: unknown }[] | undefined,
): string {
  const names = (details ?? [])
    .map((detail) => order.sellerOrders.find((sellerOrder) => sellerOrder.id === detail.value)?.businessName)
    .filter((name): name is string => name !== undefined);
  return names.length === 0 ? COPY.nothingCancellable : COPY.orderBlocked(names.join(', '));
}
