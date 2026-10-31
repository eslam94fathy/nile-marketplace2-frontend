// The unresolved idempotency intents of this tab (design 01 §6.1, R-89, T-O1 F-1). Kept in module memory, not in
// the component that holds the action: closing and reopening a dialog after an ambiguous failure must reuse the
// key, or the backend runs the action twice. Never persisted; cleared on success, `resetIntent()` and sign-out.

export interface StoredIntent {
  readonly intent: string;
  readonly key: string;
}

/** An action and its target, e.g. `['remittance']` or `['stock', variantId]`. */
export type IntentScope = readonly string[];

const intents = new Map<string, StoredIntent>();

const id = (scope: IntentScope) => JSON.stringify(scope);

/** The key for this intent of the scope: the stored one when the intent is the same, a new one otherwise. */
export function intentKey(scope: IntentScope, intent: string): string {
  const stored = intents.get(id(scope));
  if (stored?.intent === intent) return stored.key;
  const key = crypto.randomUUID();
  intents.set(id(scope), { intent, key });
  return key;
}

/** Forgets the scope's intent (after success, or when the user starts over). */
export function forgetIntent(scope: IntentScope): void {
  intents.delete(id(scope));
}

/** Forgets every intent of this tab (sign-out, session end). */
export function clearIdempotencyIntents(): void {
  intents.clear();
}
