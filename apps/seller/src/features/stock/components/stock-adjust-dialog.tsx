'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { useIdempotentMutation } from '@nile/query';
import {
  Button,
  Dialog,
  DialogContent,
  ErrorState,
  Field,
  FormAlert,
  Input,
  Skeleton,
  toast,
} from '@nile/ui';
import { useEffect, useId, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import { useNotApprovedHandler } from '@/features/profile';
import { adjustStock, type StockLevel, type VariantStock } from '../api';
import { STOCK_COPY as COPY } from '../copy';
import {
  adjustmentDelta,
  adjustSchema,
  deltaProblem,
  parseAmount,
  type AdjustMessages,
  type AdjustMode,
} from '../lib/delta';

export interface StockAdjustDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly variantId: string;
  readonly sku: string;
  /** Stock re-read when the dialog opened (spec 02 SE-12); null while that read runs. */
  readonly stock: StockLevel | null;
  readonly loadFailed: boolean;
  readonly onRetryLoad: () => void;
  /** The API's new numbers: the caller updates the product it shows. */
  readonly onAdjusted: (stock: VariantStock) => void;
  /** Stock changed meanwhile (`STOCK_ADJUSTMENT_INVALID`) or the variant is gone: re-read the product. */
  readonly onStale: () => void;
}

/** SE-12 Stock adjustment: add, remove, or set the counted on-hand number, always sent as a delta. */
export function StockAdjustDialog(props: StockAdjustDialogProps) {
  const { open, onOpenChange, sku } = props;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={COPY.title(sku)}>
        {/* Mounted only while open: every opening starts from an empty form. */}
        {open ? <AdjustBody {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function AdjustBody({ stock, loadFailed, onRetryLoad, ...props }: StockAdjustDialogProps) {
  if (loadFailed) return <ErrorState message={COPY.loadFailed} onRetry={onRetryLoad} />;
  if (stock === null) {
    return (
      <div aria-busy="true" className="space-y-3">
        <p className="text-sm text-muted-foreground">{COPY.loading}</p>
        <Skeleton className="h-40" />
      </div>
    );
  }
  return <AdjustForm stock={stock} {...props} />;
}

const MODES: readonly AdjustMode[] = ['add', 'remove', 'set'];

const MESSAGES: AdjustMessages = {
  wholeNumber: COPY.wholeNumber,
  problem: (problem, stock) => {
    switch (problem) {
      case 'none':
        return COPY.noChange;
      case 'tooLarge':
        return COPY.tooLarge;
      case 'belowReserved':
        return COPY.belowReserved(stock.sellable, stock.reserved);
    }
  },
};

type AdjustValues = z.input<ReturnType<typeof adjustSchema>>;

function AdjustForm({
  stock,
  variantId,
  onOpenChange,
  onAdjusted,
  onStale,
}: Omit<StockAdjustDialogProps, 'loadFailed' | 'onRetryLoad' | 'stock'> & { readonly stock: StockLevel }) {
  const name = useId();
  const failure = useSubmitFailure();
  const handleNotApproved = useNotApprovedHandler();
  const [stale, setStale] = useState(false);
  const adjust = useIdempotentMutation({ mutationFn: adjustStock });
  const schema = useMemo(() => adjustSchema(stock, MESSAGES), [stock]);
  const form = useForm<AdjustValues, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    // The effect sentence follows every keystroke, so the refusal reasons do too.
    mode: 'onChange',
    defaultValues: { mode: 'add', amount: '' },
  });
  const [mode, amountText] = useWatch({ control: form.control, name: ['mode', 'amount'] });

  // Fresh numbers (after `STOCK_ADJUSTMENT_INVALID`) change what the typed amount means: check it again.
  useEffect(() => {
    if (form.getValues('amount') !== '') void form.trigger('amount');
  }, [stock, form]);

  // The effect of a valid amount, stated before anything is sent (SE-12 acceptance 1).
  const amount = parseAmount(amountText, mode);
  const delta = amount === null ? null : adjustmentDelta({ mode, amount }, stock);
  const effect =
    delta !== null && deltaProblem(delta, stock) === null ? COPY.effect(delta, stock.onHand) : null;

  const onSubmit = form.handleSubmit(async ({ delta: sent }) => {
    failure.clear();
    setStale(false);
    try {
      const updated = await adjust.mutateAsync({ variantId, delta: sent });
      onAdjusted(updated);
      toast({ title: COPY.done, tone: 'success' });
      onOpenChange(false);
    } catch (error) {
      if (handleNotApproved(error)) return;
      if (isApiError(error, 'STOCK_ADJUSTMENT_INVALID')) {
        // A definite refusal: the next try is a new intent, computed from the fresh numbers.
        adjust.resetIntent();
        setStale(true);
        onStale();
        return;
      }
      if (isApiError(error, 'VARIANT_NOT_FOUND')) {
        onStale();
        toast({ title: COPY.variantGone, tone: 'destructive' });
        onOpenChange(false);
        return;
      }
      // Network errors and 5xx keep the key: "Adjust stock" again retries the same adjustment.
      failure.fail(error);
    }
  });

  return (
    <form noValidate className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
      {stale ? <FormAlert>{COPY.stale}</FormAlert> : null}
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Level label={COPY.onHand} value={stock.onHand} />
        <Level label={COPY.reserved} value={stock.reserved} />
        <Level label={COPY.sellable} value={stock.sellable} />
      </dl>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{COPY.modeLabel}</legend>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {MODES.map((item) => (
            <label key={item} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={name}
                checked={mode === item}
                onChange={() => {
                  form.setValue('mode', item, { shouldValidate: form.getValues('amount') !== '' });
                }}
                className="size-4 accent-primary"
              />
              {COPY.modes[item]}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === 'set' ? <p className="text-sm text-muted-foreground">{COPY.setHelp}</p> : null}
      <Field
        control={form.control}
        name="amount"
        label={mode === 'set' ? COPY.target : COPY.quantity}
        required
        {...(effect === null ? {} : { description: effect })}
        render={({ field, controlProps }) => (
          <Input {...field} {...controlProps} inputMode="numeric" autoComplete="off" />
        )}
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          loading={adjust.isPending}
          disabled={effect === null || adjust.isPending || failure.blocked}
        >
          {COPY.submit}
        </Button>
      </div>
    </form>
  );
}

function Level({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-lg font-medium tabular-nums">{value}</dd>
    </div>
  );
}
