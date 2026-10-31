'use client';

import { Button, Dialog, DialogContent, FormAlert, UI_COPY } from '@nile/ui';
import type { ReactNode } from 'react';

/** The two buttons that move between the steps (spec 03 AD-Q-5). */
const STEP_COPY = { continue: 'Continue', back: 'Back' } as const;

export type Step = 'form' | 'confirm';

export interface StepDialogProps {
  readonly title: string;
  readonly confirmTitle: string;
  readonly step: Step;
  /** The summary sentence shown on the confirm step (AD-Q-5: amount and payee). */
  readonly summary: string;
  readonly confirmLabel: string;
  readonly pending: boolean;
  readonly failure: { readonly message: string | null; readonly correlationId: string | undefined };
  readonly onContinue: () => void;
  readonly onBack: () => void;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
  /** The form (step 1). */
  readonly children: ReactNode;
}

/**
 * A money action in two steps (spec 03 §2.2, AD-Q-5): the form, then a summary to confirm (finance, order
 * cancellation). Escape and the
 * close button are ignored while the request runs, so its outcome is always seen.
 */
export function StepDialog({
  title,
  confirmTitle,
  step,
  summary,
  confirmLabel,
  pending,
  failure,
  onContinue,
  onBack,
  onConfirm,
  onClose,
  children,
}: StepDialogProps) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        title={step === 'form' ? title : confirmTitle}
        {...(step === 'confirm' ? { description: summary } : {})}
        footer={
          step === 'form' ? (
            <>
              <Button variant="outline" onClick={onClose}>
                {UI_COPY.cancel}
              </Button>
              <Button onClick={onContinue}>{STEP_COPY.continue}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={pending} onClick={onBack}>
                {STEP_COPY.back}
              </Button>
              <Button loading={pending} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </>
          )
        }
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        {/* The form stays mounted (hidden) on the confirm step, so Back keeps every value. */}
        <div hidden={step !== 'form'}>{children}</div>
      </DialogContent>
    </Dialog>
  );
}
