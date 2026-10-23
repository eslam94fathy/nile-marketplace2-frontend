import { CircleCheck, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../cn';

const TONES = {
  info: { classes: 'border-border bg-muted text-foreground', Icon: Info },
  success: { classes: 'border-success bg-success-muted text-foreground', Icon: CircleCheck },
} as const;

export interface NoticeProps {
  readonly tone?: keyof typeof TONES;
  readonly children: ReactNode;
  readonly className?: string;
}

/** A non-error message on a screen (e.g. "Your password was changed. Please sign in."), announced politely. */
export function Notice({ tone = 'info', children, className }: NoticeProps) {
  const { classes, Icon } = TONES[tone];
  return (
    <div role="status" className={cn('flex gap-2 rounded-md border p-3 text-sm', classes, className)}>
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
