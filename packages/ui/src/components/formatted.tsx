import { formatDateTime, formatMoney, formatMoneyRange } from '@nile/domain';
import { cn } from '../cn';

// Money, dates and countdowns render through @nile/domain, never `number` arithmetic (CLAUDE.md §8).

export interface MoneyProps {
  /** Decimal string from the API, e.g. "1250.00". */
  readonly value: string;
  /** Upper end of a price range; shown as `EGP 51.00 – EGP 71.00` when it differs. */
  readonly max?: string;
  readonly className?: string;
}

export function Money({ value, max, className }: MoneyProps) {
  const text = max === undefined ? formatMoney(value) : formatMoneyRange(value, max);
  return <span className={cn('tabular-nums', className)}>{text}</span>;
}

export interface DateTimeProps {
  /** ISO timestamp from the API (UTC). Shown in Cairo time. */
  readonly value: string;
  readonly className?: string;
}

export function DateTime({ value, className }: DateTimeProps) {
  return (
    <time dateTime={value} className={className}>
      {formatDateTime(value)}
    </time>
  );
}
