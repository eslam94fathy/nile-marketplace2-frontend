import type { ErrorCode } from './error-codes';

/** One entry of `error.details` (validation fields, or entities named by a domain error). */
export interface ErrorDetail {
  field: string;
  constraint: string;
  message: string;
  value?: string;
}

/**
 * Every failed call becomes an ApiError (CLAUDE.md §3: handle by `code`, never by message or status alone).
 * `code` is a known code or, for forward compatibility, any string a newer backend may send.
 */
export class ApiError extends Error {
  override readonly name = 'ApiError';
  /** HTTP status; 0 when no response arrived. */
  readonly status: number;
  readonly code: ErrorCode | (string & {});
  readonly details: readonly ErrorDetail[];
  /** Backend correlation id (body or `X-Correlation-Id`), shown to users as a support reference. */
  readonly correlationId: string | null;
  /** Seconds from `Retry-After` (429 / 503), or null. */
  readonly retryAfterSeconds: number | null;

  constructor(
    status: number,
    code: ErrorCode | (string & {}),
    message: string,
    details: readonly ErrorDetail[] = [],
    correlationId: string | null = null,
    retryAfterSeconds: number | null = null,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.status = status;
    this.code = code;
    this.details = details;
    this.correlationId = correlationId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isApiError<const C extends ErrorCode>(
  error: unknown,
  ...codes: C[]
): error is ApiError & { readonly code: C } {
  return error instanceof ApiError && (codes.length === 0 || (codes as string[]).includes(error.code));
}

const CORRELATION_HEADER = 'X-Correlation-Id';
const RETRY_AFTER_HEADER = 'Retry-After';

// IMF-fixdate, the HTTP-date form servers must send (RFC 9110 §5.6.7). Date.parse alone accepts "-5".
const HTTP_DATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/** `Retry-After` as seconds: either delta-seconds or an HTTP date. Invalid or missing → null. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  const trimmed = value?.trim() ?? '';
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (!HTTP_DATE.test(trimmed)) return null;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

interface ErrorEnvelope {
  success: false;
  error: { code: string; message: string; details?: ErrorDetail[] };
  correlationId?: string | null;
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null) return false;
  const { success, error } = body as { success?: unknown; error?: unknown };
  if (success !== false || typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string';
}

/** ApiError from a non-2xx response and its (already parsed, possibly text or empty) body. */
export function apiErrorFromResponse(response: Response, body: unknown): ApiError {
  const headerCorrelation = response.headers.get(CORRELATION_HEADER);
  const retryAfter = parseRetryAfter(response.headers.get(RETRY_AFTER_HEADER));
  if (!isErrorEnvelope(body)) {
    // A proxy page, an empty body or anything else that isn't the backend's envelope (design 01 §6.4).
    return new ApiError(
      response.status,
      'NETWORK_ERROR',
      `Unexpected response (HTTP ${response.status})`,
      [],
      headerCorrelation,
      retryAfter,
    );
  }
  return new ApiError(
    response.status,
    body.error.code,
    body.error.message,
    body.error.details ?? [],
    body.correlationId ?? headerCorrelation,
    retryAfter,
  );
}

/** ApiError for a call that produced no usable response (offline, DNS, CORS, invalid JSON on success). */
export function networkError(cause: unknown, status = 0): ApiError {
  return new ApiError(status, 'NETWORK_ERROR', 'The server could not be reached', [], null, null, { cause });
}
