'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields } from '@nile/domain';
import { errorMessage } from '@nile/query';
import { ConfirmDialog, Field, FormAlert, Textarea, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { reactivateUser, refreshAccountViews, resendInvite, suspendUser } from '../api';
import { ACCOUNT_COPY as COPY } from '../copy';

// Suspend, reactivate and resend invite: one implementation for AD-03 Admins, AD-24 Users and AD-26 Customer.
// Every success or "changed meanwhile" refusal reads every account view again.

/** The account changed meanwhile (or is the admin's own): refetch and explain. Other errors are the caller's. */
function handleStale(error: unknown, refresh: () => void): boolean {
  if (isApiError(error, 'USER_INVALID_STATUS_TRANSITION') || isApiError(error, 'USER_NOT_FOUND')) {
    refresh();
    toast({ title: COPY.statusChanged, tone: 'destructive' });
    return true;
  }
  if (isApiError(error, 'CANNOT_SUSPEND_SELF')) {
    refresh();
    toast({ title: COPY.cannotSuspendSelf, tone: 'destructive' });
    return true;
  }
  return false;
}

function useRefreshAccounts() {
  const queryClient = useQueryClient();
  return () => void refreshAccountViews(queryClient);
}

/** "Reactivate" without a dialog (nothing is lost); `pendingId` drives the button's loading state. */
export function useReactivate() {
  const refresh = useRefreshAccounts();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const reactivate = async (userId: string, email: string) => {
    setPendingId(userId);
    try {
      await reactivateUser(userId);
      toast({ title: COPY.reactivated(email), tone: 'success' });
      refresh();
    } catch (error) {
      if (!handleStale(error, refresh)) toast({ title: errorMessage(error), tone: 'destructive' });
    } finally {
      setPendingId(null);
    }
  };
  return { pendingId, reactivate };
}

export interface AccountDialogProps {
  readonly userId: string;
  readonly email: string;
  readonly onClose: () => void;
}

export function ResendInviteDialog({ userId, email, onClose }: AccountDialogProps) {
  const refresh = useRefreshAccounts();
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.resendTitle}
      description={COPY.resendConfirm(email)}
      confirmLabel={COPY.resend}
      onConfirm={async () => {
        try {
          await resendInvite(userId);
          toast({ title: COPY.resent(email), tone: 'success' });
        } catch (error) {
          if (isApiError(error, 'USER_NOT_INVITED')) {
            refresh();
            toast({ title: COPY.notInvited, tone: 'destructive' });
            return;
          }
          if (!handleStale(error, refresh)) toast({ title: errorMessage(error), tone: 'destructive' });
        }
      }}
    />
  );
}

const suspendSchema = z.object({ reason: fields.trimmedString(3, 500) });
type SuspendValues = z.input<typeof suspendSchema>;

export interface SuspendUserDialogProps extends AccountDialogProps {
  readonly title: string;
  readonly description: string;
}

/** Suspend with a reason (3..500); every session of the account is revoked [SPEC 20]. */
export function SuspendUserDialog({ userId, email, title, description, onClose }: SuspendUserDialogProps) {
  const refresh = useRefreshAccounts();
  const failure = useSubmitFailure();
  const form = useForm<SuspendValues, unknown, z.output<typeof suspendSchema>>({
    resolver: zodResolver(suspendSchema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });

  const confirm = async () => {
    failure.clear();
    let values: z.output<typeof suspendSchema> | undefined;
    await form.handleSubmit((parsed) => {
      values = parsed;
    })();
    if (values === undefined) throw new Error('invalid');
    try {
      await suspendUser(userId, values.reason);
      toast({ title: COPY.suspended(email) });
      refresh();
    } catch (error) {
      if (handleStale(error, refresh)) return;
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description}
      confirmLabel={COPY.suspend}
      destructive
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
          label={COPY.reason}
          required
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </ConfirmDialog>
  );
}
