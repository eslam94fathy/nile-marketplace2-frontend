'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { errorMessage } from '@nile/query';
import { Button, ConfirmDialog, Field, FormAlert, Textarea, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  approveSeller,
  reinstateSeller,
  rejectSeller,
  sellerKeys,
  suspendSeller,
  type AdminSellerDetail,
} from '../api';
import { SELLERS_COPY as COPY } from '../copy';

/** Every decision answers with the seller: it replaces the cache; lists and the dashboard queue follow. */
export function useSellerUpdates(sellerId: string) {
  const queryClient = useQueryClient();
  const settle = (seller: AdminSellerDetail) => {
    queryClient.setQueryData(sellerKeys.detail(seller.id), seller);
    void queryClient.invalidateQueries({ queryKey: sellerKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: sellerKeys.dashboard() });
  };
  /** The seller changed meanwhile (spec 03 AD-05): refetch and say so. True when handled. */
  const handleStale = (error: unknown): boolean => {
    if (
      isApiError(error, 'SELLER_INVALID_STATUS_TRANSITION') ||
      isApiError(error, 'SELLER_EMAIL_NOT_VERIFIED')
    ) {
      void queryClient.invalidateQueries({ queryKey: sellerKeys.detail(sellerId) });
      toast({
        title: isApiError(error, 'SELLER_EMAIL_NOT_VERIFIED') ? COPY.notVerified : COPY.statusChanged,
        tone: 'destructive',
      });
      return true;
    }
    return false;
  };
  return { settle, handleStale };
}

type Decision = 'approve' | 'reject' | 'suspend' | 'reinstate';

/** AD-05 status actions, offered by status: approve/reject when pending, suspend when approved, reinstate when suspended. */
export function SellerActions({ seller }: { readonly seller: AdminSellerDetail }) {
  const [open, setOpen] = useState<Decision | null>(null);
  const reasonId = useId();
  const { settle, handleStale } = useSellerUpdates(seller.id);
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };
  const button = (
    decision: Decision,
    label: string,
    variant: 'primary' | 'outline' | 'destructive',
    disabled = false,
  ) => (
    <Button
      variant={variant}
      disabled={disabled}
      aria-describedby={disabled ? reasonId : undefined}
      onClick={() => {
        setOpen(decision);
      }}
    >
      {label}
    </Button>
  );

  const approve = async () => {
    try {
      settle(await approveSeller(seller.id));
      toast({ title: COPY.approveDone(seller.businessName), tone: 'success' });
    } catch (error) {
      if (!handleStale(error)) toast({ title: errorMessage(error), tone: 'destructive' });
    }
  };

  let buttons = null;
  if (seller.status === 'pending_approval') {
    buttons = (
      <>
        {button('approve', COPY.approve, 'primary', !seller.emailVerified)}
        {button('reject', COPY.reject, 'destructive')}
      </>
    );
  } else if (seller.status === 'approved') {
    buttons = button('suspend', COPY.suspend, 'destructive');
  } else if (seller.status === 'suspended') {
    buttons = button('reinstate', COPY.reinstate, 'primary');
  }
  if (buttons === null) return null;

  return (
    <section aria-labelledby="seller-actions-heading" className="space-y-2">
      <h2 id="seller-actions-heading" className="sr-only">
        {COPY.actionsHeading}
      </h2>
      <div className="flex flex-wrap gap-2">{buttons}</div>
      {seller.status === 'pending_approval' && !seller.emailVerified ? (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {COPY.notVerified}
        </p>
      ) : null}
      <ConfirmDialog
        open={open === 'approve'}
        onOpenChange={close}
        title={COPY.approve}
        description={COPY.approveConfirm(seller.businessName)}
        confirmLabel={COPY.approve}
        onConfirm={approve}
      />
      {open === 'reject' ? (
        <ReasonDialog
          title={COPY.reject}
          help={COPY.rejectHelp}
          required
          destructive
          onClose={() => {
            setOpen(null);
          }}
          send={async (reason) => {
            settle(await rejectSeller(seller.id, reason ?? ''));
            toast({ title: COPY.rejectDone(seller.businessName) });
          }}
          handleStale={handleStale}
        />
      ) : null}
      {open === 'suspend' ? (
        <ReasonDialog
          title={COPY.suspend}
          help={COPY.suspendHelp}
          required
          destructive
          onClose={() => {
            setOpen(null);
          }}
          send={async (reason) => {
            settle(await suspendSeller(seller.id, reason ?? ''));
            toast({ title: COPY.suspendDone(seller.businessName) });
          }}
          handleStale={handleStale}
        />
      ) : null}
      {open === 'reinstate' ? (
        <ReasonDialog
          title={COPY.reinstate}
          help={COPY.reinstateHelp}
          required={false}
          destructive={false}
          onClose={() => {
            setOpen(null);
          }}
          send={async (reason) => {
            settle(await reinstateSeller(seller.id, reason));
            toast({ title: COPY.reinstateDone(seller.businessName), tone: 'success' });
          }}
          handleStale={handleStale}
        />
      ) : null}
    </section>
  );
}

/** Reasons: 3..500 trimmed [SPEC 05]; optional ones are omitted when empty. */
const requiredReason = z.object({ reason: fields.trimmedString(3, 500) });
const optionalReason = z.object({
  reason: z
    .string()
    .trim()
    .transform((value) => (value === '' ? null : value))
    .pipe(fields.trimmedString(3, 500).nullable()),
});

interface ReasonDialogProps {
  readonly title: string;
  readonly help: string;
  readonly required: boolean;
  readonly destructive: boolean;
  readonly onClose: () => void;
  readonly send: (reason: string | null) => Promise<void>;
  readonly handleStale: (error: unknown) => boolean;
}

function ReasonDialog({ title, help, required, destructive, onClose, send, handleStale }: ReasonDialogProps) {
  const failure = useSubmitFailure();
  const schema = required ? requiredReason : optionalReason;
  const form = useForm<{ reason: string }, unknown, { reason: string | null }>({
    resolver: zodResolver(schema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });

  const confirm = async () => {
    failure.clear();
    let reason: string | null | undefined;
    await form.handleSubmit((values) => {
      reason = values.reason;
    })();
    if (reason === undefined) throw new Error('invalid');
    try {
      await send(reason);
    } catch (error) {
      if (handleStale(error)) return;
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
      title={title}
      description={help}
      confirmLabel={title}
      destructive={destructive}
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter in the reason must not submit: the dialog's button confirms.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="reason"
          label={required ? COPY.reason : COPY.reasonOptional}
          required={required}
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </ConfirmDialog>
  );
}
