'use client';

import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { Button } from './button';

// Radix Dialog: focus moves into the dialog and back to the trigger, Escape closes, the rest of the page is
// inert (conventions §10). Every dialog has a title; the description states the consequence (§9).

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const OVERLAY = 'fixed inset-0 z-50 bg-slate-900/50';

interface DialogContentProps extends ComponentProps<typeof DialogPrimitive.Content> {
  readonly title: string;
  readonly description?: ReactNode;
  readonly footer?: ReactNode;
  /** `center`: dialog. `bottom` / `start` / `end`: sheet from the bottom (mobile) or a side edge. */
  readonly placement?: 'center' | 'bottom' | 'start' | 'end';
}

const PLACEMENT = {
  center: 'top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-lg',
  start: 'inset-y-0 start-0 w-full max-w-xs',
  end: 'inset-y-0 end-0 w-full max-w-md',
} as const;

export function DialogContent({
  title,
  description,
  footer,
  placement = 'center',
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={OVERLAY} />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col gap-4 overflow-y-auto bg-background p-6 text-foreground shadow-lg',
          PLACEMENT[placement],
          className,
        )}
        // Without a description Radix warns; `undefined` tells it the omission is deliberate.
        {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        {...props}
      >
        <div className="space-y-1.5 pe-8">
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          {description === undefined ? null : (
            <DialogPrimitive.Description className="text-sm text-muted-foreground">
              {description}
            </DialogPrimitive.Description>
          )}
        </div>
        {children}
        {footer === undefined ? null : <div className="flex flex-wrap justify-end gap-2">{footer}</div>}
        <DialogPrimitive.Close asChild>
          <Button variant="ghost" size="icon" className="absolute end-3 top-3" aria-label={UI_COPY.close}>
            <X aria-hidden="true" />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: string;
  /** One sentence stating the consequence (conventions §9). */
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
  /** May be async: the confirm button shows progress and the dialog stays open until it settles. */
  readonly onConfirm: () => unknown;
  /** Extra inputs (e.g. an optional note), rendered between the text and the buttons. */
  readonly children?: ReactNode;
}

/**
 * Confirmation for destructive or irreversible actions. Closes after `onConfirm` resolves; when it throws,
 * the dialog stays open so the caller can show the error (and the user keeps their input).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = UI_COPY.cancel,
  destructive = false,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller reports the error (toast or alert); keeping the dialog open keeps the user's input.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // While the action runs, Escape and the close button must not hide its outcome.
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent
        title={title}
        description={description}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="outline" disabled={pending}>
                {cancelLabel}
              </Button>
            </DialogClose>
            <Button
              variant={destructive ? 'destructive' : 'primary'}
              loading={pending}
              onClick={() => void confirm()}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}
