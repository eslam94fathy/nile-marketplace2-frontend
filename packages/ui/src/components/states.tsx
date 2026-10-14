import { CircleAlert, Inbox } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { Button } from './button';

// The standard screen states (conventions §3). Every screen defines loading, empty, error and
// not-authorised; these are the shared building blocks.

export interface EmptyStateProps {
  /** What is empty, e.g. "Your cart is empty." */
  readonly title: string;
  readonly description?: string;
  /** The next useful action, e.g. a link to browse categories. */
  readonly action?: ReactNode;
  readonly className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <Inbox aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {description === undefined ? null : (
        <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
      )}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  readonly message?: string;
  /** Refetch. The button is left out when there is nothing to retry. */
  readonly onRetry?: () => void;
  readonly retrying?: boolean;
  readonly correlationId?: string | undefined;
  readonly className?: string;
}

/** Inline error block for a failed query: message, "Try again", and the reference in small text. */
export function ErrorState({
  message = UI_COPY.genericError,
  onRetry,
  retrying = false,
  correlationId,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-lg border border-destructive bg-destructive-muted px-4 py-8 text-center text-destructive',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="size-8" />
      <p className="font-medium">{message}</p>
      {onRetry === undefined ? null : (
        <Button variant="outline" onClick={onRetry} loading={retrying}>
          {UI_COPY.tryAgain}
        </Button>
      )}
      {correlationId === undefined ? null : <p className="text-xs">{UI_COPY.reference(correlationId)}</p>}
    </div>
  );
}

/** A placeholder in the shape of the content while it loads (first loads; never a blank page). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-slate-200 motion-reduce:animate-none', className)}
      {...props}
    />
  );
}

/** Wraps skeletons so assistive technology hears one "Loading…" instead of nothing. */
export function LoadingRegion({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{UI_COPY.loading}</span>
      {children}
    </div>
  );
}
