'use client';

import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { ConfirmDialog, FormAlert, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { catalogKeys } from '../api';
import { CATALOG_COPY as COPY } from '../copy';

/** Every catalog write is followed by a fresh tree (spec 03 AD-07). */
export function useCatalogRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: catalogKeys.tree() });
}

const GONE_CODES = ['CATEGORY_NOT_FOUND', 'ATTRIBUTE_NOT_FOUND', 'OPTION_NOT_FOUND'] as const;

/** Something was removed or changed elsewhere: reload the tree and say so. True when handled. */
export function useGoneHandler() {
  const refresh = useCatalogRefresh();
  return (error: unknown): boolean => {
    if (!GONE_CODES.some((code) => isApiError(error, code))) return false;
    void refresh();
    toast({ title: COPY.errors.gone, tone: 'destructive' });
    return true;
  };
}

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
  readonly destructive?: boolean;
  readonly children: ReactNode;
}

/** A dialog around a small form: validates, sends, closes on success (catalog dialogs, spec 03 AD-07). */
export function FormDialog<Values extends FieldValues, Output>({
  title,
  description,
  confirmLabel,
  form,
  onSubmit,
  onClose,
  destructive = false,
  children,
}: FormDialogProps<Values, Output>) {
  const failure = useSubmitFailure();
  const handleGone = useGoneHandler();

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
      if (handleGone(error)) return;
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
