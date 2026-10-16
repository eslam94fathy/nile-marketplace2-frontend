'use client';

// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { ConfirmDialog, FormAlert } from '@nile/ui';
import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

export interface FormDialogProps<Values extends FieldValues, Output> {
  readonly title: string;
  readonly description?: ReactNode;
  readonly confirmLabel: string;
  readonly form: UseFormReturn<Values, unknown, Output>;
  /**
   * Sends the parsed values. Resolve `true` when done (the dialog closes), `false` to stay open (e.g. after
   * `form.setError`). A thrown error is shown as a form alert, the input kept.
   */
  readonly onSubmit: (values: Output) => Promise<boolean>;
  readonly onClose: () => void;
  /** An error the screen handles itself (refetch and explain): true closes the dialog without an alert. */
  readonly handleError?: (error: unknown) => boolean;
  readonly destructive?: boolean;
  readonly children: ReactNode;
}

/** A dialog around a small form: validates, sends, closes on success (catalog and delivery dialogs). */
export function FormDialog<Values extends FieldValues, Output>({
  title,
  description,
  confirmLabel,
  form,
  onSubmit,
  onClose,
  handleError,
  destructive = false,
  children,
}: FormDialogProps<Values, Output>) {
  const failure = useSubmitFailure();

  const confirm = async () => {
    failure.clear();
    let parsed: { values: Output } | undefined;
    await form.handleSubmit((values) => {
      parsed = { values };
    })();
    if (parsed === undefined) throw new Error('invalid');
    let done: boolean;
    try {
      done = await onSubmit(parsed.values);
    } catch (error) {
      if (handleError?.(error) === true) return;
      failure.fail(error);
      throw error;
    }
    if (!done) throw new Error('kept open');
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      description={description ?? ''}
      confirmLabel={confirmLabel}
      destructive={destructive}
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
        {children}
      </form>
    </ConfirmDialog>
  );
}
