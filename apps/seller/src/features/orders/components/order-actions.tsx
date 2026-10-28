'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, sellerOrderActions } from '@nile/domain';
import { errorMessage, useIdempotentMutation } from '@nile/query';
import { Button, ConfirmDialog, Field, FormAlert, Textarea, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { acceptOrder, cancelOrder, confirmReturn, markReady, orderKeys, type SellerOrder } from '../api';
import { ORDERS_COPY as COPY } from '../copy';

/** Every action answers with the whole seller order: it replaces the cache; lists and overview follow. */
export function useOrderUpdates(sellerOrderId: string) {
  const queryClient = useQueryClient();
  const handleNotApproved = useNotApprovedHandler();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: orderKeys.detail(sellerOrderId) });
  };
  const settle = (order: SellerOrder) => {
    queryClient.setQueryData(orderKeys.detail(order.id), order);
    void queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: orderKeys.overview() });
  };
  /**
   * The failures every action shares. True when handled (status changed meanwhile: the order is refetched and
   * the reason toasted); false leaves it to the caller's form alert.
   */
  const handleShared = (error: unknown, changedMessage: string = COPY.statusChanged): boolean => {
    if (handleNotApproved(error)) return true;
    if (isApiError(error, 'SELLER_ORDER_INVALID_STATUS_TRANSITION')) {
      refresh();
      toast({ title: changedMessage, tone: 'destructive' });
      return true;
    }
    if (isApiError(error, 'SELLER_ORDER_NOT_CANCELLABLE')) {
      refresh();
      toast({ title: COPY.notCancellable, tone: 'destructive' });
      return true;
    }
    if (isApiError(error, 'SELLER_ORDER_NOT_FOUND')) {
      // The page turns into "not found" once refetched.
      refresh();
      return true;
    }
    return false;
  };
  return { settle, refresh, handleShared };
}

const deadlinePassed = (order: SellerOrder) =>
  order.acceptDeadlineAt !== null && Date.parse(order.acceptDeadlineAt) <= Date.now();

/**
 * SE-15 actions for the order's status (A1 confirm, A2 ready, A3 cancel, A5 return received; A4 per item
 * in the items table). Only what the status allows is offered; the backend still decides.
 */
export function OrderActions({ order }: { readonly order: SellerOrder }) {
  const access = useSellerAccess();
  const reasonId = useId();
  const { settle, handleShared } = useOrderUpdates(order.id);
  const [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState<'ready' | 'cancel' | 'return' | null>(null);
  const actions = sellerOrderActions(order.status).filter((action) => action !== 'cancel_items');
  if (actions.length === 0) return null;
  const disabled = !access.orders;
  const describedBy = access.reason === null ? undefined : reasonId;

  const accept = async () => {
    setPending(true);
    try {
      settle(await acceptOrder(order.id));
      toast({ title: COPY.accepted, tone: 'success' });
    } catch (error) {
      // After the deadline the timeout job may have cancelled it first (SPEC 09 UC-OR-3).
      if (!handleShared(error, deadlinePassed(order) ? COPY.acceptTimedOut : COPY.statusChanged)) {
        toast({ title: errorMessage(error), tone: 'destructive' });
      }
    } finally {
      setPending(false);
    }
  };

  const ready = async () => {
    try {
      settle(await markReady(order.id));
      toast({ title: COPY.readyDone, tone: 'success' });
    } catch (error) {
      if (!handleShared(error)) toast({ title: errorMessage(error), tone: 'destructive' });
    }
  };

  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <section aria-labelledby="order-actions-heading" className="space-y-2">
      <h2 id="order-actions-heading" className="sr-only">
        {COPY.actionsHeading}
      </h2>
      <div className="flex flex-wrap gap-2">
        {actions.includes('accept') ? (
          <Button
            loading={pending}
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => void accept()}
          >
            {COPY.accept}
          </Button>
        ) : null}
        {actions.includes('mark_ready') ? (
          <Button
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => {
              setDialog('ready');
            }}
          >
            {COPY.ready}
          </Button>
        ) : null}
        {actions.includes('confirm_return') ? (
          <Button
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => {
              setDialog('return');
            }}
          >
            {COPY.confirmReturn}
          </Button>
        ) : null}
        {actions.includes('cancel_order') ? (
          <Button
            variant="outline"
            disabled={disabled}
            aria-describedby={describedBy}
            onClick={() => {
              setDialog('cancel');
            }}
          >
            {COPY.cancelOrder}
          </Button>
        ) : null}
      </div>
      {access.reason === null ? null : (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {access.reason}
        </p>
      )}
      <ConfirmDialog
        open={dialog === 'ready'}
        onOpenChange={close}
        title={COPY.readyTitle}
        description={COPY.readyConfirm}
        confirmLabel={COPY.ready}
        onConfirm={ready}
      />
      <ConfirmReturnDialog order={order} open={dialog === 'return'} onOpenChange={close} />
      <CancelOrderDialog order={order} open={dialog === 'cancel'} onOpenChange={close} />
    </section>
  );
}

interface DialogProps {
  readonly order: SellerOrder;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** A5: idempotent, one key per order, reused on retry. */
function ConfirmReturnDialog({ order, open, onOpenChange }: DialogProps) {
  const { settle, handleShared } = useOrderUpdates(order.id);
  const failure = useSubmitFailure();
  const mutation = useIdempotentMutation({ mutationFn: confirmReturn });

  const confirm = async () => {
    failure.clear();
    try {
      settle(await mutation.mutateAsync({ sellerOrderId: order.id }));
      toast({ title: COPY.returnConfirmed, tone: 'success' });
    } catch (error) {
      if (handleShared(error)) return;
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) failure.clear();
        onOpenChange(next);
      }}
      title={COPY.confirmReturnTitle}
      description={COPY.confirmReturnText}
      confirmLabel={COPY.confirmReturn}
      onConfirm={confirm}
    >
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
    </ConfirmDialog>
  );
}

const cancelSchema = z.object({ note: fields.nullableTrimmedString(1, 500) });
type CancelValues = z.input<typeof cancelSchema>;

/** A3: optional note, idempotent with one key per order + note, reused on retry. */
function CancelOrderDialog({ order, open, onOpenChange }: DialogProps) {
  const { settle, handleShared } = useOrderUpdates(order.id);
  const failure = useSubmitFailure();
  const mutation = useIdempotentMutation({ mutationFn: cancelOrder });
  const form = useForm<CancelValues, unknown, z.output<typeof cancelSchema>>({
    resolver: zodResolver(cancelSchema),
    mode: 'onBlur',
    defaultValues: { note: '' },
  });

  const close = (next: boolean) => {
    if (!next) {
      failure.clear();
      form.reset();
    }
    onOpenChange(next);
  };

  const confirm = async () => {
    failure.clear();
    let values: z.output<typeof cancelSchema> | undefined;
    await form.handleSubmit((parsed) => {
      values = parsed;
    })();
    // Invalid note: keep the dialog open with the field error.
    if (values === undefined) throw new Error('invalid');
    try {
      settle(await mutation.mutateAsync({ sellerOrderId: order.id, note: values.note }));
      toast({ title: COPY.cancelled });
      form.reset();
    } catch (error) {
      if (handleShared(error)) {
        close(false);
        return;
      }
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={close}
      title={COPY.cancelOrderTitle}
      description={COPY.cancelOrderConfirm}
      confirmLabel={COPY.cancelOrderAction}
      cancelLabel={COPY.keep}
      destructive
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter in the note must not submit: the dialog's button confirms.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="note"
          label={COPY.note}
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </ConfirmDialog>
  );
}
