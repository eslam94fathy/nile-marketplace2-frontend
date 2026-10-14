import type { ComponentProps } from 'react';
import { cn } from '../cn';

/** Shared look of text controls; `aria-invalid` (set by `Field`) turns the border red. */
export const controlClasses =
  'w-full rounded-md border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:border-2 sm:text-sm';

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(controlClasses, 'h-10', className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(controlClasses, 'min-h-20 py-2', className)} {...props} />;
}
