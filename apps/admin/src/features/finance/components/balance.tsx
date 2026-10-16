import { formatMoney, moneyGreaterThan } from '@nile/domain';
import { cn } from '@nile/ui';

const ZERO = '0';

/** A balance; a negative one in red with its minus (SPEC 12 FI-1), so the sign never relies on colour alone. */
export function Balance({ value, className }: { readonly value: string; readonly className?: string }) {
  const negative = moneyGreaterThan(ZERO, value);
  return (
    <span className={cn(negative && 'font-medium text-destructive', className)}>{formatMoney(value)}</span>
  );
}
