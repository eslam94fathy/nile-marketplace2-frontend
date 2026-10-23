import { type ApiError, HEADER, type ErrorCode, type ErrorDetail } from '@nile/api';
import { NextResponse } from 'next/server';

// Responses of the apps' own routes (/api/auth/*, /api/bff/*). They use the backend's envelope, so the
// browser parses BFF errors and backend errors the same way (by code), and they are never cached.

export const NO_STORE = 'no-store';
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The browser's `X-Correlation-Id` when it is a UUID (what the backend accepts), else a new one. */
export function correlationIdOf(request: Request): string {
  const sent = request.headers.get(HEADER.CORRELATION_ID);
  return sent !== null && UUID.test(sent) ? sent : crypto.randomUUID();
}

function baseHeaders(correlationId: string): Headers {
  return new Headers({ 'Cache-Control': NO_STORE, [HEADER.CORRELATION_ID]: correlationId });
}

export function okResponse(data: unknown, correlationId: string): NextResponse {
  return NextResponse.json({ success: true, data }, { status: 200, headers: baseHeaders(correlationId) });
}

export function noContentResponse(correlationId: string): NextResponse {
  return new NextResponse(null, { status: 204, headers: baseHeaders(correlationId) });
}

export interface ErrorResponseInit {
  details?: readonly ErrorDetail[];
  retryAfterSeconds?: number | null;
}

export function errorResponse(
  status: number,
  code: ErrorCode | (string & {}),
  message: string,
  correlationId: string,
  init: ErrorResponseInit = {},
): NextResponse {
  const headers = baseHeaders(correlationId);
  if (init.retryAfterSeconds !== undefined && init.retryAfterSeconds !== null) {
    headers.set('Retry-After', String(init.retryAfterSeconds));
  }
  const error = {
    code,
    message,
    ...(init.details !== undefined && init.details.length > 0 ? { details: init.details } : {}),
  };
  return NextResponse.json({ success: false, error, correlationId }, { status, headers });
}

/** HTTP status for a call that got no backend response. */
function statusWithoutResponse(code: string): number {
  return code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
}

/**
 * An ApiError from a backend call as our response: the backend's status, code, message, details and
 * `Retry-After` unchanged; `UPSTREAM_TIMEOUT` → 504 and `NETWORK_ERROR` → 502 when nothing came back.
 */
export function apiErrorResponse(error: ApiError, correlationId: string): NextResponse {
  const status = error.status === 0 ? statusWithoutResponse(error.code) : error.status;
  return errorResponse(status, error.code, error.message, error.correlationId ?? correlationId, {
    details: error.details,
    retryAfterSeconds: error.retryAfterSeconds,
  });
}

export type BodyResult = { ok: true; text: string } | { ok: false; response: NextResponse };

/**
 * The request body as text, at most `maxBytes`. Larger bodies → 413 PAYLOAD_TOO_LARGE; a non-empty body
 * that isn't `application/json` → 415 VALIDATION_FAILED (decided 2026-10-14, design 01 R-20).
 */
export async function readJsonBody(
  request: Request,
  maxBytes: number,
  correlationId: string,
): Promise<BodyResult> {
  const tooLarge = (): BodyResult => ({
    ok: false,
    response: errorResponse(
      413,
      'PAYLOAD_TOO_LARGE',
      `Request body exceeds ${maxBytes} bytes`,
      correlationId,
    ),
  });
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) return tooLarge();

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body !== null) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  }
  if (size === 0) return { ok: true, text: '' };

  const mediaType = (request.headers.get('Content-Type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return {
      ok: false,
      response: errorResponse(
        415,
        'VALIDATION_FAILED',
        'Request body must be application/json',
        correlationId,
        {
          details: [{ field: 'Content-Type', constraint: 'mediaType', message: 'must be application/json' }],
        },
      ),
    };
  }
  return { ok: true, text: Buffer.concat(chunks).toString('utf8') };
}
