'use client';

import { UI_COPY } from '@nile/ui';
import { useId } from 'react';
import type { PaymentMethod } from '../api';
import { CHECKOUT_COPY } from '../copy';
import { KASHIER_PAYMENT_WINDOW_MINUTES } from '../lib/constants';

export interface PaymentMethodPickerProps {
  readonly value: PaymentMethod | null;
  readonly onChange: (method: PaymentMethod) => void;
}

const OPTIONS: readonly { method: PaymentMethod; label: string; description: string; available: boolean }[] =
  [
    {
      method: 'cod',
      label: CHECKOUT_COPY.payment.cod.label,
      description: CHECKOUT_COPY.payment.cod.description,
      available: true,
    },
    {
      method: 'kashier',
      label: CHECKOUT_COPY.payment.kashier.label,
      description: CHECKOUT_COPY.payment.kashier.description(KASHIER_PAYMENT_WINDOW_MINUTES),
      // Card payment (redirect, return page) is built in T-F4; until then the option is shown, not offered.
      available: false,
    },
  ];

/** SF-07 §2 Payment method: radio, no preselection (SF-Q-4). */
export function PaymentMethodPicker({ value, onChange }: PaymentMethodPickerProps) {
  const name = useId();
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">{CHECKOUT_COPY.paymentLegend}</legend>
      {OPTIONS.map((option) => {
        const id = `${name}-${option.method}`;
        return (
          <div key={option.method}>
            <input
              id={id}
              type="radio"
              name={name}
              className="peer sr-only"
              checked={value === option.method}
              disabled={!option.available}
              onChange={() => {
                onChange(option.method);
              }}
            />
            <label
              htmlFor={id}
              className="block cursor-pointer rounded-lg border border-border p-4 peer-checked:border-2 peer-checked:border-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:bg-muted"
            >
              <span className="block font-medium">{option.label}</span>
              <span className="block text-sm text-muted-foreground">{option.description}</span>
              {option.available ? null : (
                <span className="mt-1 block text-sm text-muted-foreground">
                  {UI_COPY.placeholder('T-F4')}
                </span>
              )}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}
