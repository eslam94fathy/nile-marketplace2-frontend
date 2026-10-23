import { fields } from '@nile/domain';
import { useId, type ComponentProps } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { controlClasses } from './input';

/**
 * Egyptian mobile number: a fixed `+20` prefix and the 10 digits after it (conventions §5). The prefix is
 * announced through `aria-describedby`; `fields.egPhone` turns the typed digits into E.164.
 */
export function PhoneInput({
  className,
  'aria-describedby': describedBy,
  ...props
}: Omit<ComponentProps<'input'>, 'type'>) {
  const prefixId = useId();
  return (
    <div className="flex">
      <span
        id={prefixId}
        className="inline-flex h-10 items-center rounded-s-md border border-e-0 border-input bg-muted px-3 text-sm text-muted-foreground"
      >
        <span aria-hidden="true">{fields.EG_PHONE_PREFIX}</span>
        <span className="sr-only">{UI_COPY.phonePrefix(fields.EG_PHONE_PREFIX)}</span>
      </span>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        aria-describedby={[prefixId, describedBy].filter(Boolean).join(' ')}
        className={cn(controlClasses, 'h-10 rounded-s-none', className)}
        {...props}
      />
    </div>
  );
}
