'use client';

import { Button, Input, Label } from '@nile/ui';
import { useId, useState, type SyntheticEvent } from 'react';
import { CHECKOUT_COPY } from '../copy';
import { normaliseCouponCode } from '../lib/coupon';

const COPY = CHECKOUT_COPY.coupon;

export type CouponFieldState =
  | { readonly status: 'none' }
  | { readonly status: 'checking'; readonly code: string }
  | { readonly status: 'applied'; readonly code: string };

export interface CouponFieldProps {
  readonly state: CouponFieldState;
  /** Why the last code was refused or removed; shown under the field. */
  readonly error: string | null;
  readonly onApply: (code: string) => void;
  readonly onRemove: () => void;
  readonly disabled?: boolean;
}

/**
 * SF-07-C "Have a coupon?" in the review step (SF-Q-14): a disclosure with the code field and "Apply"; once
 * the API priced it, "Coupon {code} applied" with "Remove". The field opens by itself when there is an error.
 */
export function CouponField({ state, error, onApply, onRemove, disabled = false }: CouponFieldProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);
  const fieldId = useId();
  const panelId = useId();
  const messageId = useId();

  if (state.status === 'applied') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-success-muted px-3 py-2 text-sm">
        <span role="status">{COPY.applied(state.code)}</span>
        <Button variant="link" size="sm" className="px-0" disabled={disabled} onClick={onRemove}>
          {COPY.remove}
        </Button>
      </div>
    );
  }

  const message = invalid ? COPY.invalid : error;
  const expanded = open || message !== null;
  const apply = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = normaliseCouponCode(input);
    setInvalid(code === null);
    if (code !== null) onApply(code);
  };

  return (
    <div className="space-y-2">
      <Button
        variant="link"
        className="px-0"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => {
          setOpen(!expanded);
        }}
      >
        {COPY.disclosure}
      </Button>
      {expanded ? (
        <form id={panelId} onSubmit={apply} className="space-y-1" noValidate>
          <Label htmlFor={fieldId}>{COPY.label}</Label>
          <div className="flex gap-2">
            <Input
              id={fieldId}
              value={input}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={message !== null}
              {...(message === null ? {} : { 'aria-describedby': messageId })}
              onChange={(event) => {
                setInput(event.target.value);
              }}
            />
            <Button type="submit" variant="outline" loading={state.status === 'checking'} disabled={disabled}>
              {COPY.apply}
            </Button>
          </div>
          {state.status === 'checking' ? (
            <p role="status" className="text-sm text-muted-foreground">
              {COPY.checking}
            </p>
          ) : null}
          {message === null ? null : (
            <p id={messageId} role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
        </form>
      ) : null}
    </div>
  );
}
