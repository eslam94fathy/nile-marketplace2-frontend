'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, ITEM_CANCEL_REASON_LABELS, ITEM_CANCEL_REASONS } from '@nile/domain';
import { useIdempotentMutation } from '@nile/query';
import { ConfirmDialog, Field, FormAlert, Input, Notice, Select, Textarea, toast } from '@nile/ui';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { cancelItem, type SellerOrder, type SellerOrderItem } from '../api';
import { ORDERS_COPY as COPY } from '../copy';
import { cancelsWholeOrder, openQuantity } from '../lib/order-math';
import { useOrderUpdates } from './order-actions';

const REASON_OPTIONS = ITEM_CANCEL_REASONS.map((reason) => ({
  value: reason,
  label: ITEM_CANCEL_REASON_LABELS[reason],
}));

/** SE-15-A4 form: quantity 1..open, a reason, a note required for "Other" [SPEC 09 §4.2]. */
function cancelItemSchema(open: number) {
  return z
    .object({
      quantity: z
        .string()
        .trim()
        .regex(/^\d+$/, COPY.quantityRange(open))
        .transform(Number)
        .pipe(z.number().int().min(1, COPY.quantityRange(open)).max(open, COPY.quantityRange(open))),
      // Starts empty (no reason preselected), so the input is a string.
      reason: z.string().min(1, fields.FIELD_MESSAGES.required).pipe(z.enum(ITEM_CANCEL_REASONS)),
      note: fields.nullableTrimmedString(1, 500),
    })
    .superRefine((values, ctx) => {
      if (values.reason === 'other' && values.note === null) {
        ctx.addIssue({ code: 'custom', path: ['note'], message: COPY.noteNeeded });
      }
    });
}
type CancelItemSchema = ReturnType<typeof cancelItemSchema>;
type CancelItemValues = z.input<CancelItemSchema>;

export interface CancelItemDialogProps {
  readonly order: SellerOrder;
  /** The line being cancelled; null closes the dialog. */
  readonly item: SellerOrderItem | null;
  readonly onClose: () => void;
}

export function CancelItemDialog({ order, item, onClose }: CancelItemDialogProps) {
  // Mounted per item: each opening starts from an empty form with that line's limit.
  return item === null ? null : <CancelItemForm key={item.id} order={order} item={item} onClose={onClose} />;
}

function CancelItemForm({
  order,
  item,
  onClose,
}: {
  readonly order: SellerOrder;
  readonly item: SellerOrderItem;
  readonly onClose: () => void;
}) {
  const { settle, refresh, handleShared } = useOrderUpdates(order.id);
  const failure = useSubmitFailure();
  const mutation = useIdempotentMutation({ mutationFn: cancelItem });
  const open = openQuantity(item);
  const schema = useMemo(() => cancelItemSchema(open), [open]);
  const form = useForm<CancelItemValues, unknown, z.output<CancelItemSchema>>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { quantity: '', reason: '', note: '' },
  });
  const quantityText = useWatch({ control: form.control, name: 'quantity' });
  const typed = /^\d+$/.test(quantityText.trim()) ? Number(quantityText.trim()) : 0;
  const wholeOrder = typed >= 1 && typed <= open && cancelsWholeOrder(order, item.id, typed);

  const confirm = async () => {
    failure.clear();
    let values: z.output<CancelItemSchema> | undefined;
    await form.handleSubmit((parsed) => {
      values = parsed;
    })();
    if (values === undefined) throw new Error('invalid');
    try {
      const updated = await mutation.mutateAsync({
        sellerOrderId: order.id,
        itemId: item.id,
        body: {
          quantity: values.quantity,
          reason: values.reason,
          ...(values.note === null ? {} : { note: values.note }),
        },
      });
      settle(updated);
      toast({ title: COPY.itemsCancelled(values.quantity) });
    } catch (error) {
      if (handleShared(error)) {
        onClose();
        return;
      }
      if (isApiError(error, 'ITEM_CANCEL_QUANTITY_INVALID')) {
        // The open quantity changed (another tab, the customer): show the current order.
        mutation.resetIntent();
        refresh();
        toast({ title: COPY.quantityInvalid, tone: 'destructive' });
        onClose();
        return;
      }
      if (isApiError(error, 'ORDER_ITEM_NOT_FOUND')) {
        refresh();
        toast({ title: COPY.itemGone, tone: 'destructive' });
        onClose();
        return;
      }
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={COPY.cancelItemsTitle(item.productName)}
      description={COPY.openQuantity(open)}
      confirmLabel={COPY.cancelItems}
      cancelLabel={COPY.keep}
      destructive
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter must not submit: the dialog's button confirms.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="quantity"
          label={COPY.quantity}
          required
          render={({ field, controlProps }) => <Input {...field} {...controlProps} inputMode="numeric" />}
        />
        <Field
          control={form.control}
          name="reason"
          label={COPY.reason}
          required
          render={({ field, controlProps }) => (
            <Select
              {...controlProps}
              options={REASON_OPTIONS}
              placeholder={COPY.reasonPlaceholder}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
            />
          )}
        />
        <Field
          control={form.control}
          name="note"
          label={COPY.note}
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
        {wholeOrder ? <Notice>{COPY.wholeOrder}</Notice> : null}
      </form>
    </ConfirmDialog>
  );
}
