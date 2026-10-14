'use client';

import { isApiError } from '@nile/api';
import { rateLimitedMessage } from '@nile/domain';
import { errorMessage } from '@nile/query';
import { useCooldown } from '@nile/ui';
import { useState } from 'react';

export interface SubmitFailure {
  /** Form-level message, or null when there is nothing to show. */
  readonly message: string | null;
  /** Support reference of the failed call (conventions §3). */
  readonly correlationId: string | undefined;
  /** True while `RATE_LIMITED` blocks the action (conventions §4: countdown, then available again). */
  readonly blocked: boolean;
  /** The failed call's error, for screens that react to a code. */
  readonly error: unknown;
  fail: (error: unknown) => void;
  clear: () => void;
}

/**
 * The form-level failure of a submit: message by code (screen overrides first), and for `RATE_LIMITED` a
 * live "Try again in {n} s." that disables the action until `Retry-After` has passed.
 */
export function useSubmitFailure(overrides: Readonly<Partial<Record<string, string>>> = {}): SubmitFailure {
  const [error, setError] = useState<unknown>(null);
  const cooldown = useCooldown();

  const rateLimited = isApiError(error, 'RATE_LIMITED');
  let message: string | null = null;
  if (error !== null) {
    if (rateLimited && error.retryAfterSeconds !== null) {
      message = cooldown.remaining > 0 ? rateLimitedMessage(cooldown.remaining) : null;
    } else {
      message = errorMessage(error, overrides);
    }
  }

  return {
    message,
    correlationId: isApiError(error) ? (error.correlationId ?? undefined) : undefined,
    blocked: cooldown.remaining > 0,
    error,
    fail: (next) => {
      setError(next);
      if (isApiError(next, 'RATE_LIMITED') && next.retryAfterSeconds !== null) {
        cooldown.start(next.retryAfterSeconds);
      }
    },
    clear: () => {
      setError(null);
    },
  };
}
