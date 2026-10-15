'use client';

import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which these pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { Button, FormAlert } from '@nile/ui';
import { useMutation } from '@tanstack/react-query';
import { ORDERS_COPY } from '../copy';
import { createKashierSession } from './api';
import { goToKashier } from './redirect';

const COPY = ORDERS_COPY.payNow;

/** Thrown when the API's checkout URL is not `https:` (never followed, CLAUDE.md §9.4). */
class UnsafeCheckoutUrlError extends Error {}

export interface PayNowProps {
  readonly orderId: string;
  /** The order changed under the page (`ORDER_NOT_AWAITING_PAYMENT`): refetch it. */
  readonly onStale: () => void;
}

/**
 * SF-18-A2 Pay now (Kashier order awaiting payment, before `paymentExpiresAt`; the caller decides when it
 * shows): opens or reuses the order's Kashier session [SPEC 09 OR-7] and goes there.
 */
export function PayNow({ orderId, onStale }: PayNowProps) {
  const failure = useSubmitFailure({
    ORDER_NOT_AWAITING_PAYMENT: COPY.errors.ORDER_NOT_AWAITING_PAYMENT,
    PAYMENT_PROVIDER_UNAVAILABLE: COPY.errors.PAYMENT_PROVIDER_UNAVAILABLE,
  });
  const session = useMutation({
    mutationFn: async () => {
      const { checkoutUrl } = await createKashierSession(orderId);
      if (!goToKashier(orderId, checkoutUrl)) throw new UnsafeCheckoutUrlError();
    },
    onError: (error) => {
      if (isApiError(error, 'ORDER_NOT_AWAITING_PAYMENT')) onStale();
      failure.fail(error);
    },
  });

  return (
    <div className="space-y-3">
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <Button
        loading={session.isPending}
        // After a successful call the page is leaving for Kashier: keep the button busy until it does.
        disabled={failure.blocked || session.isSuccess}
        onClick={() => {
          failure.clear();
          session.mutate();
        }}
      >
        {COPY.action}
      </Button>
    </div>
  );
}
