'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError, unwrap } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which account pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { useIdempotentMutation } from '@nile/query';
import { Button, ConfirmDialog, Field, FormAlert, Textarea, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { browserApi } from '@/lib/browser-api';
import { orderKeys, type Order } from '../api';
import { ORDERS_COPY } from '../copy';

const COPY = ORDERS_COPY.cancel;

/** The optional note (spec 01 SF-18-A1: 1..500, trimmed like the backend; empty → not sent). */
const cancelSchema = z.object({ note: fields.nullableTrimmedString(1, 500) });
type CancelValues = z.input<typeof cancelSchema>;

interface CancelVariables {
  readonly orderId: string;
  readonly sellerOrderId: string;
  readonly note: string | null;
}

async function cancelSellerOrder(variables: CancelVariables, idempotencyKey: string): Promise<Order> {
  const { orderId, sellerOrderId, note } = variables;
  return (
    await unwrap(
      browserApi.POST('/api/v1/orders/{orderId}/seller-orders/{sellerOrderId}/cancel', {
        params: { path: { orderId, sellerOrderId }, header: { 'Idempotency-Key': idempotencyKey } },
        body: note === null ? {} : { note },
      }),
    )
  ).data;
}

export interface CancelSellerOrderProps {
  readonly order: Order;
  readonly sellerOrder: Order['sellerOrders'][number];
  /** The order changed under the page (`SELLER_ORDER_NOT_CANCELLABLE`, `SELLER_ORDER_NOT_FOUND`). */
  readonly onStale: () => void;
}

/**
 * SF-18-A1 Cancel a seller order: the caller shows it only when `canCancel` (seller order `placed`, order not
 * awaiting payment [SPEC 09 OR-9]). Idempotent: one key per order, seller order and note, reused on retry.
 */
export function CancelSellerOrder({ order, sellerOrder, onStale }: CancelSellerOrderProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const failure = useSubmitFailure();
  const form = useForm<CancelValues, unknown, z.output<typeof cancelSchema>>({
    resolver: zodResolver(cancelSchema),
    mode: 'onBlur',
    defaultValues: { note: '' },
  });
  const cancel = useIdempotentMutation({
    mutationFn: cancelSellerOrder,
    intentScope: ['storefront', 'cancel', sellerOrder.id],
    onSuccess: (updated) => {
      // The API answers with the whole order (design 02 §3.1: set `orders.detail`, invalidate the lists).
      queryClient.setQueryData(orderKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
    },
  });

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      failure.clear();
      form.reset();
    }
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
      await cancel.mutateAsync({ orderId: order.id, sellerOrderId: sellerOrder.id, note: values.note });
    } catch (error) {
      if (isApiError(error, 'SELLER_ORDER_NOT_CANCELLABLE') || isApiError(error, 'SELLER_ORDER_NOT_FOUND')) {
        onStale();
        close(false);
        toast({ title: COPY.notCancellable, tone: 'destructive' });
        return;
      }
      failure.fail(error);
      throw error;
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label={COPY.action(sellerOrder.businessName)}
        onClick={() => {
          setOpen(true);
        }}
      >
        {COPY.label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={close}
        title={COPY.title}
        description={
          <>
            {COPY.confirm(sellerOrder.businessName)}
            {order.paymentMethod === 'kashier' ? ` ${COPY.refund}` : ''}
          </>
        }
        confirmLabel={COPY.confirmAction}
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
    </>
  );
}
