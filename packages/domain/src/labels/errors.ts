// Default copy per error code (conventions §4). Screens override it with their spec's messages; everything
// unmapped falls back to the generic message. Codes are plain strings here: @nile/domain doesn't import
// @nile/api at runtime (design 01 §2.1).

export const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

/** Exact codes with a default message (conventions §4). */
export const DEFAULT_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  VALIDATION_FAILED: 'Some fields need attention.',
  FORBIDDEN: "You don't have access to this.",
  CONFLICT: 'This was changed by someone else. Please try again.',
  IDEMPOTENCY_REQUEST_IN_PROGRESS: 'Still working on your previous request…',
  INVALID_QUERY: 'Some filters were not valid and have been reset.',
  INVALID_CURSOR: 'Some filters were not valid and have been reset.',
};

const SUB_RESOURCE_NOT_FOUND = 'This item no longer exists.';
const ALREADY_UPDATED = "This was already updated. We've refreshed the page.";

/** `RATE_LIMITED` with the seconds left from `Retry-After`. */
export function rateLimitedMessage(seconds: number): string {
  return `Too many attempts. Try again in ${seconds} s.`;
}

/** The default message for `code`; screens check their own overrides first. */
export function defaultErrorMessage(code: string): string {
  const exact = DEFAULT_ERROR_MESSAGES[code];
  if (exact !== undefined) return exact;
  if (code.endsWith('_INVALID_STATUS_TRANSITION') || code.endsWith('_NOT_CANCELLABLE'))
    return ALREADY_UPDATED;
  if (code.endsWith('_NOT_FOUND')) return SUB_RESOURCE_NOT_FOUND;
  return GENERIC_ERROR_MESSAGE;
}
