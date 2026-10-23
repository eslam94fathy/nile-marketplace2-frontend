'use client';

import { Check, ChevronDown } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../cn';
import { controlClasses } from './input';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
  readonly disabled?: boolean;
}

export interface SelectProps
  extends
    Omit<ComponentProps<typeof SelectPrimitive.Root>, 'children'>,
    Pick<
      ComponentProps<'button'>,
      'id' | 'aria-describedby' | 'aria-invalid' | 'aria-label' | 'className' | 'onBlur'
    > {
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
}

/**
 * A single-choice list (Radix Select: keyboard, typeahead, screen-reader support). Labels come from the
 * caller (e.g. enum label maps); values are the API values.
 */
export function Select({
  options,
  placeholder,
  id,
  className,
  onBlur,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  'aria-label': ariaLabel,
  ...root
}: SelectProps) {
  return (
    <SelectPrimitive.Root {...root}>
      <SelectPrimitive.Trigger
        id={id}
        onBlur={onBlur}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-label={ariaLabel}
        className={cn(controlClasses, 'flex h-10 items-center justify-between gap-2 text-start', className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 min-w-(--radix-select-trigger-width) overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled === true}
                className="relative flex cursor-default items-center rounded-sm py-2 ps-8 pe-2 text-sm outline-none select-none data-disabled:opacity-50 data-highlighted:bg-primary data-highlighted:text-primary-foreground"
              >
                <SelectPrimitive.ItemIndicator className="absolute start-2 inline-flex items-center">
                  <Check aria-hidden="true" className="size-4" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
