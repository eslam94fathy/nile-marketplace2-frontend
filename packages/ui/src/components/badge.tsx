import type { Labels } from '@nile/domain';
import type { ComponentProps } from 'react';
import { cn } from '../cn';
import type { Tone, Tones } from '../status-tones';

/** Text/background pairs from the tested contrast list (tokens.ts CONTRAST_PAIRS). */
const TONE_CLASSES = {
  neutral: 'bg-secondary text-secondary-foreground',
  info: 'bg-accent text-accent-foreground',
  success: 'bg-success-muted text-success',
  warning: 'bg-warning-muted text-warning',
  destructive: 'bg-destructive-muted text-destructive',
} as const satisfies Record<Tone, string>;

export interface BadgeProps extends ComponentProps<'span'> {
  readonly tone?: Tone;
}

export function Badge({ tone = 'neutral', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}

export interface StatusBadgeProps<Value extends string> {
  readonly value: Value;
  /** The view's label map, e.g. `SELLER_ORDER_STATUS_LABELS.seller` (@nile/domain). */
  readonly labels: Labels<Value>;
  /** The enum's tone map, e.g. `SELLER_ORDER_STATUS_TONES`. */
  readonly tones: Tones<Value>;
  readonly className?: string;
}

/** A status as text with a supporting colour: `<StatusBadge value={s} labels={…} tones={…} />`. */
export function StatusBadge<Value extends string>({
  value,
  labels,
  tones,
  className,
}: StatusBadgeProps<Value>) {
  return (
    <Badge tone={tones[value]} className={className}>
      {labels[value]}
    </Badge>
  );
}
