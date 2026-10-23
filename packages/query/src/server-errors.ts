import { ApiError } from '@nile/api';
import { defaultErrorMessage, GENERIC_ERROR_MESSAGE, rateLimitedMessage } from '@nile/domain';

// Error handling for screens and forms (design 01 §6.2, conventions §4): by code, never by message text.

/** Backend field name (`details[].field`) → the form field and the message to show there. */
export type ServerFieldMap<Field extends string> = Readonly<
  Record<string, { readonly field: Field; readonly message: string }>
>;

/** The part of React Hook Form's `setError` used here (no runtime dependency on the form library). */
export type SetFieldError<Field extends string> = (
  field: Field,
  error: { type: 'server'; message: string },
) => void;

/**
 * Puts `VALIDATION_FAILED` details on their form fields. Returns true only when every detail found a field;
 * otherwise (or for any other code) the screen shows a form-level alert (conventions §4).
 */
export function applyServerErrors<Field extends string>(
  error: unknown,
  setError: SetFieldError<Field>,
  fieldMap: ServerFieldMap<Field>,
): boolean {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_FAILED' || error.details.length === 0) {
    return false;
  }
  let allMapped = true;
  for (const detail of error.details) {
    const target = Object.hasOwn(fieldMap, detail.field) ? fieldMap[detail.field] : undefined;
    if (target === undefined) allMapped = false;
    else setError(target.field, { type: 'server', message: target.message });
  }
  return allMapped;
}

/** The message for an error: the screen's override for its code, the rate-limit wording, or the default. */
export function errorMessage(
  error: unknown,
  overrides: Readonly<Partial<Record<string, string>>> = {},
): string {
  if (!(error instanceof ApiError)) return GENERIC_ERROR_MESSAGE;
  const override = Object.hasOwn(overrides, error.code) ? overrides[error.code] : undefined;
  if (override !== undefined) return override;
  if (error.code === 'RATE_LIMITED' && error.retryAfterSeconds !== null) {
    return rateLimitedMessage(error.retryAfterSeconds);
  }
  return defaultErrorMessage(error.code);
}
