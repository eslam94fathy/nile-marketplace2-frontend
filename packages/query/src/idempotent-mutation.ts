'use client';

import { isApiError } from '@nile/api';
import { useMutation, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';
import { useCallback } from 'react';
import { forgetIntent, intentKey, type IntentScope } from './intent-store';

/** Conventions §4: `IDEMPOTENCY_REQUEST_IN_PROGRESS` → wait 1 s, re-send with the same key, at most 3 times. */
export const IN_PROGRESS_RETRY_DELAY_MS = 1_000;
export const IN_PROGRESS_MAX_RETRIES = 3;

/** JSON with object keys sorted, so two bodies with the same content give the same intent. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export interface IdempotentMutationOptions<TData, TVariables> extends Omit<
  UseMutationOptions<TData, unknown, TVariables>,
  'mutationFn' | 'retry' | 'scope'
> {
  readonly mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<TData>;
  /**
   * The action and its target (e.g. `['remittance']`, `['stock', variantId]`). The key is kept per scope for the
   * tab, so it survives the dialog or page being closed and opened again (T-O1 F-1).
   */
  readonly intentScope: IntentScope;
  /** The user's intent; the same intent reuses its key. Default: the variables as stable JSON. */
  readonly intentOf?: (variables: TVariables) => string;
}

export type IdempotentMutationResult<TData, TVariables> = UseMutationResult<TData, unknown, TVariables> & {
  /** Forget the stored key: the next call is a new intent even with the same variables. */
  readonly resetIntent: () => void;
};

/**
 * A mutation behind an `Idempotency-Key` (design 01 §6.1, conventions §6): one key per user intent, reused
 * on every retry of that intent (a replayed success is a success), also after the component holding it was
 * unmounted and mounted again, a new key when the intent changes, and
 * cleared after success. Never retried by TanStack; only `IDEMPOTENCY_REQUEST_IN_PROGRESS` is re-sent here.
 */
export function useIdempotentMutation<TData, TVariables>({
  mutationFn,
  intentScope: scope,
  intentOf = stableJson,
  onSuccess,
  ...options
}: IdempotentMutationOptions<TData, TVariables>): IdempotentMutationResult<TData, TVariables> {
  // A stable dependency for the callbacks below: the scope's content, not its array identity.
  const scopeId = JSON.stringify(scope);

  const mutation = useMutation<TData, unknown, TVariables>({
    ...options,
    retry: false,
    mutationFn: async (variables) => {
      const key = intentKey(scope, intentOf(variables));
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await mutationFn(variables, key);
        } catch (error) {
          if (!isApiError(error, 'IDEMPOTENCY_REQUEST_IN_PROGRESS') || attempt >= IN_PROGRESS_MAX_RETRIES)
            throw error;
          await wait(IN_PROGRESS_RETRY_DELAY_MS);
        }
      }
    },
    onSuccess: (...args) => {
      forgetIntent(scope);
      return onSuccess?.(...args);
    },
  });

  const resetIntent = useCallback(() => {
    forgetIntent(JSON.parse(scopeId) as IntentScope);
  }, [scopeId]);

  return { ...mutation, resetIntent };
}
