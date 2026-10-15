'use client';

import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';
import { cn } from '../cn';
import { UI_COPY } from '../copy';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';

export interface QuantityStepperProps {
  readonly value: number;
  /** Upper bound (e.g. min(available, 99)); the lower bound is 1. */
  readonly max: number;
  readonly onChange: (value: number) => void;
  /** Visible label; pass `hideLabel` where the row already says what it is (e.g. a cart line). */
  readonly label?: string;
  readonly hideLabel?: boolean;
  readonly disabled?: boolean;
  /** Extra accessible context for the buttons, e.g. the product name on a cart line. */
  readonly itemName?: string;
  readonly className?: string;
}

/** A quantity field with − / + buttons, always within 1..max (spec 01 SF-05, SF-06). */
export function QuantityStepper({
  value,
  max,
  onChange,
  label = UI_COPY.quantity,
  hideLabel = false,
  disabled = false,
  itemName,
  className,
}: QuantityStepperProps) {
  const id = useId();
  const clamp = (next: number) => Math.min(Math.max(next, 1), Math.max(max, 1));
  const suffix = itemName === undefined ? '' : `, ${itemName}`;
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>
        {itemName === undefined ? label : `${label}${suffix}`}
      </Label>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={`${UI_COPY.decreaseQuantity}${suffix}`}
          disabled={disabled || value <= 1}
          onClick={() => {
            onChange(clamp(value - 1));
          }}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={max}
          value={value}
          disabled={disabled}
          className="w-20 text-center"
          onChange={(event) => {
            const next = Number.parseInt(event.target.value, 10);
            onChange(Number.isNaN(next) ? 1 : clamp(next));
          }}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label={`${UI_COPY.increaseQuantity}${suffix}`}
          disabled={disabled || value >= max}
          onClick={() => {
            onChange(clamp(value + 1));
          }}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
