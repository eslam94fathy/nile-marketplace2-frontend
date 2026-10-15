import type { ErrorCode } from '@nile/api';
import { errorBody, okBody, type ErrorBodyInit } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { AuthScreensProvider, type AuthScreensConfig } from '../config';

// Test harness: the screens inside a provider with fake API calls and navigation. Sign-in and verification
// call the app's auth routes with fetch, so those are mocked over HTTP (jsdom's origin).

const ORIGIN = 'http://localhost:3000';

export const ROUTES = {
  home: '/',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

export function makeTestConfig(overrides: Partial<AuthScreensConfig> = {}) {
  const api = {
    requestPasswordReset: vi.fn<(email: string) => Promise<void>>(() => Promise.resolve()),
    resetPassword: vi.fn<AuthScreensConfig['api']['resetPassword']>(() => Promise.resolve()),
    resendVerificationCode: vi.fn<(email: string) => Promise<void>>(() => Promise.resolve()),
  };
  const navigate = vi.fn<(url: string) => void>();
  const config: AuthScreensConfig = {
    routes: ROUTES,
    authPaths: Object.values(ROUTES).filter((path) => path !== ROUTES.home),
    otherSites: {
      seller: { account: 'seller', site: 'seller', url: 'http://seller.test' },
      delivery_agent: { account: 'delivery', site: 'delivery', url: 'http://agent.test' },
    },
    api,
    navigate,
    Link: ({ href, className, children }) => (
      <a href={href} className={className}>
        {children}
      </a>
    ),
    ...overrides,
  };
  return { config, api, navigate };
}

export function renderScreen(ui: ReactElement, config: AuthScreensConfig = makeTestConfig().config) {
  return renderWithProviders(<AuthScreensProvider config={config}>{ui}</AuthScreensProvider>);
}

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

/** A handler for the app's auth route `/api/auth/<action>`, recording the bodies it received. */
export function mockAuthRoute(
  action: 'login' | 'verify-email' | 'password-change',
  answer:
    | { ok: unknown }
    | { noContent: true }
    | { error: ErrorCode; status: number; init?: ErrorBodyInit; headers?: Record<string, string> },
) {
  const bodies: unknown[] = [];
  const handler = http.post(`${ORIGIN}/api/auth/${action}`, async ({ request }) => {
    bodies.push(await request.json());
    if ('ok' in answer) return HttpResponse.json(okBody(answer.ok));
    if ('noContent' in answer) return new HttpResponse(null, { status: 204 });
    return HttpResponse.json(errorBody(answer.error, answer.init), {
      status: answer.status,
      ...(answer.headers === undefined ? {} : { headers: answer.headers }),
    });
  });
  return { handler, bodies };
}
