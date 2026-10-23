import { errorBody, okBody, type ErrorBodyInit } from '@nile/test-utils';
import type { ErrorCode } from '@nile/api';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { TEST_APP_ORIGIN } from './setup';

/** The BFF proxy base, for `mockApi(…, { base: BFF_BASE })`. */
export const BFF_BASE = `${TEST_APP_ORIGIN}/api/bff`;

/** One MSW server per test file; any request without a handler fails the test (MSW 3). */
export function setupMswServer() {
  const server = setupServer();
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}

type AuthAction = 'login' | 'verify-email' | 'invite' | 'logout';

/** A handler for this app's auth route (`/api/auth/<action>`), recording the bodies it received. */
export function mockAuthRoute(
  action: AuthAction,
  answer:
    | { ok: unknown }
    | { error: ErrorCode; status: number; init?: ErrorBodyInit; headers?: Record<string, string> },
) {
  const bodies: unknown[] = [];
  const handler = http.post(`${TEST_APP_ORIGIN}/api/auth/${action}`, async ({ request }) => {
    bodies.push(await request.json());
    if ('ok' in answer) return HttpResponse.json(okBody(answer.ok));
    return HttpResponse.json(errorBody(answer.error, answer.init), {
      status: answer.status,
      ...(answer.headers === undefined ? {} : { headers: answer.headers }),
    });
  });
  return { handler, bodies };
}
