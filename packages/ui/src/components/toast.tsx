'use client';

import { X } from 'lucide-react';
import { Toast as ToastPrimitive } from 'radix-ui';
import { useSyncExternalStore } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';

// Toasts (Radix Toast): announced politely (conventions §10), paused while hovered or focused, dismissable
// by swipe, Escape or the close button. `toast()` may be called from any client code; <Toaster /> renders
// them once per app (in the root providers).

export type ToastTone = 'neutral' | 'success' | 'destructive';

export interface ToastInput {
  readonly title: string;
  readonly description?: string;
  readonly tone?: ToastTone;
  /** Shown as "Reference: …" so support can find the failed request (conventions §3). */
  readonly correlationId?: string | undefined;
}

interface ToastItem extends ToastInput {
  readonly id: number;
}

/** Long enough to read a sentence and a reference; Radix pauses it while the toast has hover or focus. */
export const TOAST_DURATION_MS = 8_000;
const MAX_VISIBLE = 3;

let items: readonly ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: readonly ToastItem[]) {
  items = next;
  for (const listener of listeners) listener();
}

/** Shows a toast; returns its id (for `dismissToast`). */
export function toast(input: ToastInput): number {
  const id = nextId++;
  emit([...items, { ...input, id }].slice(-MAX_VISIBLE));
  return id;
}

export function dismissToast(id: number): void {
  emit(items.filter((item) => item.id !== id));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const NO_TOASTS: readonly ToastItem[] = [];

const TONE = {
  neutral: 'border-border bg-popover text-popover-foreground',
  success: 'border-success bg-success-muted text-success',
  destructive: 'border-destructive bg-destructive-muted text-destructive',
} as const satisfies Record<ToastTone, string>;

export function Toaster() {
  const current = useSyncExternalStore(
    subscribe,
    () => items,
    () => NO_TOASTS,
  );
  return (
    <ToastPrimitive.Provider duration={TOAST_DURATION_MS} label="Notification">
      {current.map(({ id, title, description, tone = 'neutral', correlationId }) => (
        <ToastPrimitive.Root
          key={id}
          type="background"
          onOpenChange={(open) => {
            if (!open) dismissToast(id);
          }}
          className={cn('relative rounded-lg border p-4 pe-10 shadow-lg', TONE[tone])}
        >
          <ToastPrimitive.Title className="text-sm font-semibold">{title}</ToastPrimitive.Title>
          {description === undefined ? null : (
            <ToastPrimitive.Description className="mt-1 text-sm">{description}</ToastPrimitive.Description>
          )}
          {correlationId === undefined ? null : (
            <p className="mt-1 text-xs">{UI_COPY.reference(correlationId)}</p>
          )}
          <ToastPrimitive.Close
            aria-label={UI_COPY.close}
            className="absolute end-2 top-2 rounded-md p-1 hover:bg-slate-900/5"
          >
            <X aria-hidden="true" className="size-4" />
          </ToastPrimitive.Close>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed end-0 bottom-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4" />
    </ToastPrimitive.Provider>
  );
}
