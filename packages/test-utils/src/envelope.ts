import type { ErrorCode } from '@nile/api';
import type { components } from '@nile/api/schema';

type ErrorEnvelope = components['schemas']['ErrorEnvelope'];
type ErrorDetail = NonNullable<ErrorEnvelope['error']['details']>[number];

/** Fixed correlation id in mocked error answers, so assertions on it are stable. */
export const TEST_CORRELATION_ID = '0b0e0f53-6f5a-4c43-9c39-9d1b1e0a2f10';

/** The backend's success envelope (CLAUDE.md §3). `meta` only on lists. */
export function okBody<Data, Meta>(data: Data, meta?: Meta): { success: true; data: Data; meta?: Meta } {
  return meta === undefined ? { success: true, data } : { success: true, data, meta };
}

export interface ErrorBodyInit {
  readonly message?: string;
  readonly details?: readonly ErrorDetail[];
}

/** The backend's error envelope. The message is never shown to users (errors are handled by code). */
export function errorBody(code: ErrorCode, init: ErrorBodyInit = {}): ErrorEnvelope {
  return {
    success: false,
    error: {
      code,
      message: init.message ?? `${code} (mocked)`,
      ...(init.details === undefined ? {} : { details: [...init.details] }),
    },
    correlationId: TEST_CORRELATION_ID,
  };
}
