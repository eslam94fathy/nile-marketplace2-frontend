import type { BffApp, ErrorCode } from '@nile/api';
import { mockApi, TEST_CORRELATION_ID } from '@nile/test-utils';
import { delay, http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AuthAppConfig } from './config';
import { createAuthRouteHandler } from './route-handlers';
import { unsealSession, type BodyAuthTokens } from './session';
import {
  KEY_RING,
  makeRequest,
  NOW,
  sessionCookie,
  setCookies,
  testConfig,
  tokensFor,
  type RequestInit,
} from './test/fixtures';

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

const CORRELATION = '7d0c2a43-29c8-4a8a-8a43-0e5b2f6a9e11';
const CREDENTIALS = { email: 'user@example.test', password: '  pass word  ' };

function setup(app: BffApp = 'storefront', overrides: Partial<AuthAppConfig> = {}) {
  const { config, logs } = testConfig(app, overrides);
  const POST = createAuthRouteHandler(() => config);
  const call = (action: string, init: RequestInit = {}) =>
    POST(makeRequest(`/api/auth/${action}`, init), { params: Promise.resolve({ action }) });
  return { call, logs };
}

/** No response body or log line may ever contain a token or the password. */
async function expectNoSecrets(response: Response, logs: string[], tokens: BodyAuthTokens) {
  const text = await response.clone().text();
  for (const secret of [tokens.accessToken, tokens.refreshToken, CREDENTIALS.password]) {
    expect(text).not.toContain(secret);
    for (const line of logs) expect(line).not.toContain(secret);
  }
}

function recordLogout() {
  const revoked: string[] = [];
  server.use(
    mockApi('post', '/auth/logout', async ({ request, reply }) => {
      revoked.push(((await request.json()) as { refreshToken: string }).refreshToken);
      return reply.noContent();
    }),
  );
  return revoked;
}

describe('POST /api/auth/login', () => {
  it('signs in: backend called with exactly email, password and deviceName; session cookies written; no token returned', async () => {
    const tokens = tokensFor('storefront');
    let sent: { body: unknown; correlation: string | null; auth: string | null } | undefined;
    server.use(
      mockApi('post', '/auth/login', async ({ request, reply }) => {
        sent = {
          body: await request.json(),
          correlation: request.headers.get('X-Correlation-Id'),
          auth: request.headers.get('Authorization'),
        };
        return reply.ok(tokens);
      }),
    );
    const { call, logs } = setup();
    const response = await call('login', {
      body: JSON.stringify(CREDENTIALS),
      headers: { 'X-Correlation-Id': CORRELATION },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Correlation-Id')).toBe(CORRELATION);
    expect(await response.clone().json()).toEqual({ success: true, data: { user: tokens.user } });
    // Passwords are never trimmed (CLAUDE.md §6).
    expect(sent).toEqual({
      body: { ...CREDENTIALS, deviceName: 'Web (storefront)' },
      correlation: CORRELATION,
      auth: null,
    });

    const [session, version] = setCookies(response);
    expect(session?.name).toBe('__Host-nile_storefront_session');
    expect(session?.attributes).toEqual(
      expect.arrayContaining(['Path=/', 'Max-Age=2592000', 'Secure', 'HttpOnly', 'SameSite=lax']),
    );
    const stored = await unsealSession(session?.value ?? '', KEY_RING, NOW);
    expect(stored).toMatchObject({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user,
    });
    expect(version?.name).toBe('__Host-nile_storefront_sv');
    expect(version?.value).toBe(String(Date.parse(tokens.accessTokenExpiresAt)));
    expect(version?.attributes).not.toContain('HttpOnly');

    await expectNoSecrets(response, logs, tokens);
    expect(logs.some((line) => line.includes('LOGIN_SUCCEEDED'))).toBe(true);
  });

  it('uses each app’s device name', async () => {
    let deviceName: unknown;
    server.use(
      mockApi('post', '/auth/login', async ({ request, reply }) => {
        deviceName = ((await request.json()) as { deviceName?: unknown }).deviceName;
        return reply.ok(tokensFor('agent'));
      }),
    );
    await setup('agent').call('login', { body: JSON.stringify(CREDENTIALS) });
    expect(deviceName).toBe('Web (agent)');
  });

  // The BFF never asks for the web cookie transport, so a missing refresh token is a contract break
  // (backend spec 03 §8.1): no session may be written without one.
  it('refuses tokens without a refresh token: 500, no cookie, nothing leaked', async () => {
    const tokens = { ...tokensFor('storefront'), refreshToken: null };
    server.use(mockApi('post', '/auth/login', ({ reply }) => reply.ok(tokens)));
    const { call, logs } = setup();
    const response = await call('login', { body: JSON.stringify(CREDENTIALS) });

    expect(response.status).toBe(500);
    expect(((await response.clone().json()) as { error: { code: string } }).error.code).toBe(
      'INTERNAL_ERROR',
    );
    expect(setCookies(response)).toEqual([]);
    const text = await response.clone().text();
    expect(text).not.toContain(tokens.accessToken);
    for (const line of logs) expect(line).not.toContain(tokens.accessToken);
  });

  it('drops the cookie prefix and Secure for local http development', async () => {
    server.use(mockApi('post', '/auth/login', ({ reply }) => reply.ok(tokensFor('storefront'))));
    const response = await setup('storefront', { cookieSecure: false }).call('login', {
      body: JSON.stringify(CREDENTIALS),
    });
    const [session] = setCookies(response);
    expect(session?.name).toBe('nile_storefront_session');
    expect(session?.attributes).not.toContain('Secure');
  });

  it.each<[ErrorCode, number]>([
    ['INVALID_CREDENTIALS', 401],
    ['EMAIL_NOT_VERIFIED', 403],
    ['ACCOUNT_SUSPENDED', 403],
    ['INTERNAL_ERROR', 500],
  ])('passes %s (%i) through unchanged and writes no cookie', async (code, status) => {
    server.use(mockApi('post', '/auth/login', ({ reply }) => reply.error(status, code)));
    const response = await setup().call('login', { body: JSON.stringify(CREDENTIALS) });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      success: false,
      error: { code, message: `${code} (mocked)` },
      correlationId: TEST_CORRELATION_ID,
    });
    expect(setCookies(response)).toEqual([]);
  });

  it('passes VALIDATION_FAILED details and RATE_LIMITED Retry-After through', async () => {
    const details = [{ field: 'email', constraint: 'isEmail', message: 'email must be an email' }];
    server.use(
      mockApi('post', '/auth/login', ({ reply }) => reply.error(400, 'VALIDATION_FAILED', { details })),
    );
    const invalid = await setup().call('login', { body: JSON.stringify(CREDENTIALS) });
    expect(invalid.status).toBe(400);
    expect(((await invalid.json()) as { error: { details: unknown } }).error.details).toEqual(details);

    server.use(
      http.post('http://backend.test/api/v1/auth/login', () =>
        HttpResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'slow down' }, correlationId: null },
          { status: 429, headers: { 'Retry-After': '42' } },
        ),
      ),
    );
    const limited = await setup().call('login', { body: JSON.stringify(CREDENTIALS) });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBe('42');
    expect(((await limited.json()) as { error: { code: string } }).error.code).toBe('RATE_LIMITED');
  });

  it('a seller signing in to the admin app gets WRONG_APP, no cookie, and the new session is revoked', async () => {
    const tokens = tokensFor('seller');
    server.use(mockApi('post', '/auth/login', ({ reply }) => reply.ok(tokens)));
    const revoked = recordLogout();
    const { call, logs } = setup('admin');
    const response = await call('login', { body: JSON.stringify(CREDENTIALS) });

    expect(response.status).toBe(403);
    const body = (await response.clone().json()) as { error: { code: string; details: unknown[] } };
    expect(body.error.code).toBe('WRONG_APP');
    expect(body.error.details).toEqual([
      expect.objectContaining({ field: 'role', constraint: 'app', value: 'seller' }),
    ]);
    expect(setCookies(response)).toEqual([]);
    expect(revoked).toEqual([tokens.refreshToken]);
    await expectNoSecrets(response, logs, tokens);
    expect(logs.some((line) => line.includes('LOGIN_WRONG_APP'))).toBe(true);
  });

  it('every app accepts only its own role', async () => {
    const apps: BffApp[] = ['storefront', 'seller', 'admin', 'agent'];
    for (const app of apps) {
      for (const owner of apps) {
        server.use(mockApi('post', '/auth/login', ({ reply }) => reply.ok(tokensFor(owner))));
        recordLogout();
        const response = await setup(app).call('login', { body: JSON.stringify(CREDENTIALS) });
        expect(response.status, `${owner} → ${app}`).toBe(app === owner ? 200 : 403);
        expect(setCookies(response).length, `${owner} → ${app}`).toBe(app === owner ? 2 : 0);
      }
    }
  });

  it('revokes the previous session when signing in over it', async () => {
    const previous = tokensFor('storefront');
    server.use(mockApi('post', '/auth/login', ({ reply }) => reply.ok(tokensFor('storefront'))));
    const revoked = recordLogout();
    const response = await setup().call('login', {
      body: JSON.stringify(CREDENTIALS),
      cookie: await sessionCookie('storefront', previous),
    });
    expect(response.status).toBe(200);
    expect(revoked).toEqual([previous.refreshToken]);
  });

  it.each([
    ['an unknown key', JSON.stringify({ ...CREDENTIALS, role: 'admin' }), 400, 'VALIDATION_FAILED'],
    ['a missing field', JSON.stringify({ email: CREDENTIALS.email }), 400, 'VALIDATION_FAILED'],
    ['a non-string field', JSON.stringify({ ...CREDENTIALS, password: 1 }), 400, 'VALIDATION_FAILED'],
    ['no body', undefined, 400, 'MALFORMED_JSON'],
    ['malformed JSON', '{"email":', 400, 'MALFORMED_JSON'],
    [
      'an oversized body',
      JSON.stringify({ ...CREDENTIALS, password: 'x'.repeat(2000) }),
      413,
      'PAYLOAD_TOO_LARGE',
    ],
  ])('rejects %s without calling the backend', async (_, body, status, code) => {
    const response = await setup().call('login', body === undefined ? {} : { body });
    expect(response.status).toBe(status);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(code);
  });

  it('rejects a non-JSON body with 415 VALIDATION_FAILED', async () => {
    const response = await setup().call('login', {
      body: 'email=a&password=b',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    expect(response.status).toBe(415);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
  });

  it('answers 504 UPSTREAM_TIMEOUT and 502 NETWORK_ERROR when the backend does not answer', async () => {
    server.use(
      http.post('http://backend.test/api/v1/auth/login', async () => {
        await delay(200);
        return HttpResponse.json({});
      }),
    );
    const slow = await setup('storefront', { upstreamTimeoutMs: 20 }).call('login', {
      body: JSON.stringify(CREDENTIALS),
    });
    expect(slow.status).toBe(504);
    expect(((await slow.json()) as { error: { code: string } }).error.code).toBe('UPSTREAM_TIMEOUT');

    server.use(http.post('http://backend.test/api/v1/auth/login', () => HttpResponse.error()));
    const down = await setup().call('login', { body: JSON.stringify(CREDENTIALS) });
    expect(down.status).toBe(502);
    expect(((await down.json()) as { error: { code: string } }).error.code).toBe('NETWORK_ERROR');
  });
});

describe('CSRF on auth routes', () => {
  it.each([
    ['a cross-site request without Origin', { crossSite: true }],
    ['another origin', { headers: { Origin: 'http://evil.test' } }],
    ['a missing X-Nile-Client header', { crossSite: true, headers: { Origin: 'http://app.test' } }],
  ] satisfies [string, RequestInit][])(
    'rejects %s with 403 CSRF_REJECTED before anything else',
    async (_, init) => {
      for (const action of ['login', 'refresh', 'logout']) {
        const { call, logs } = setup();
        const response = await call(action, { ...init, body: JSON.stringify(CREDENTIALS) });
        expect(response.status, action).toBe(403);
        expect(((await response.json()) as { error: { code: string } }).error.code).toBe('CSRF_REJECTED');
        expect(setCookies(response)).toEqual([]);
        expect(logs.some((line) => line.includes('CSRF_REJECTED'))).toBe(true);
      }
    },
  );

  it('answers 404 ROUTE_NOT_FOUND for an unknown action', async () => {
    for (const action of ['change-password', 'constructor', '__proto__']) {
      const response = await setup().call(action);
      expect(response.status, action).toBe(404);
    }
  });
});

describe('POST /api/auth/verify-email', () => {
  const VERIFY = { email: 'user@example.test', otp: '123456' };

  it('verifies and signs in: backend called with exactly email and otp, cookies written, no token returned', async () => {
    const tokens = tokensFor('storefront');
    let sent: unknown;
    server.use(
      mockApi('post', '/auth/email/verify', async ({ request, reply }) => {
        sent = await request.json();
        return reply.ok(tokens);
      }),
    );
    const { call, logs } = setup();
    const response = await call('verify-email', { body: JSON.stringify(VERIFY) });
    expect(response.status).toBe(200);
    expect(await response.clone().json()).toEqual({ success: true, data: { user: tokens.user } });
    expect(sent).toEqual(VERIFY);
    expect(setCookies(response)).toHaveLength(2);
    await expectNoSecrets(response, logs, tokens);
    expect(logs.some((line) => line.includes('EMAIL_VERIFIED'))).toBe(true);
  });

  it('passes INVALID_OTP through without a cookie', async () => {
    server.use(mockApi('post', '/auth/email/verify', ({ reply }) => reply.error(400, 'INVALID_OTP')));
    const response = await setup().call('verify-email', { body: JSON.stringify(VERIFY) });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('INVALID_OTP');
    expect(setCookies(response)).toEqual([]);
  });

  it('a seller verifying on the storefront gets WRONG_APP and no session', async () => {
    const tokens = tokensFor('seller');
    server.use(mockApi('post', '/auth/email/verify', ({ reply }) => reply.ok(tokens)));
    const revoked = recordLogout();
    const response = await setup().call('verify-email', { body: JSON.stringify(VERIFY) });
    expect(response.status).toBe(403);
    expect(setCookies(response)).toEqual([]);
    expect(revoked).toEqual([tokens.refreshToken]);
  });

  it('rejects unknown keys without calling the backend', async () => {
    const response = await setup().call('verify-email', { body: JSON.stringify({ ...VERIFY, role: 'x' }) });
    expect(response.status).toBe(400);
  });

  it('does not exist in apps without registration', async () => {
    for (const app of ['admin', 'agent'] as const) {
      const response = await setup(app).call('verify-email', { body: JSON.stringify(VERIFY) });
      expect(response.status, app).toBe(404);
    }
  });
});

describe('POST /api/auth/invite (storefront landing, SF-20)', () => {
  const INVITE = { token: 't'.repeat(43), password: ' new password ' };

  it.each(['admin', 'agent'] as const)(
    'a %s invite: password set, the new session revoked at once, no cookie, only role and email returned',
    async (app) => {
      const tokens = tokensFor(app);
      let sent: unknown;
      server.use(
        mockApi('post', '/auth/invite/accept', async ({ request, reply }) => {
          sent = await request.json();
          return reply.ok(tokens);
        }),
      );
      const revoked = recordLogout();
      const { call, logs } = setup('storefront');
      const response = await call('invite', { body: JSON.stringify(INVITE) });

      expect(response.status).toBe(200);
      expect(await response.clone().json()).toEqual({
        success: true,
        data: { role: tokens.user.role, email: tokens.user.email },
      });
      expect(sent).toEqual(INVITE);
      expect(revoked).toEqual([tokens.refreshToken]);
      expect(setCookies(response)).toEqual([]);
      await expectNoSecrets(response, logs, tokens);
      for (const line of logs) expect(line).not.toContain(INVITE.token);
    },
  );

  it('passes INVALID_INVITE_TOKEN through, with nothing to revoke and no cookie', async () => {
    server.use(
      mockApi('post', '/auth/invite/accept', ({ reply }) => reply.error(400, 'INVALID_INVITE_TOKEN')),
    );
    const response = await setup('storefront').call('invite', { body: JSON.stringify(INVITE) });
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('INVALID_INVITE_TOKEN');
    expect(setCookies(response)).toEqual([]);
  });

  it('an unexpected role still has its session revoked and gets a generic error', async () => {
    const tokens = tokensFor('storefront');
    server.use(mockApi('post', '/auth/invite/accept', ({ reply }) => reply.ok(tokens)));
    const revoked = recordLogout();
    const response = await setup('storefront').call('invite', { body: JSON.stringify(INVITE) });
    expect(response.status).toBe(500);
    expect(revoked).toEqual([tokens.refreshToken]);
    expect(setCookies(response)).toEqual([]);
  });

  it('exists only on the storefront', async () => {
    for (const app of ['seller', 'admin', 'agent'] as const) {
      const response = await setup(app).call('invite', { body: JSON.stringify(INVITE) });
      expect(response.status, app).toBe(404);
    }
  });

  it('rejects unknown keys without calling the backend', async () => {
    const response = await setup('storefront').call('invite', {
      body: JSON.stringify({ ...INVITE, role: 'admin' }),
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/password-change', () => {
  const CHANGE = { currentPassword: ' old pass ', newPassword: ' new password ' };

  it('adds the Bearer token and the refresh token from the session; the session (cookie) stays as it is', async () => {
    const tokens = tokensFor('seller');
    let sent: { body: unknown; auth: string | null } | undefined;
    server.use(
      mockApi('post', '/auth/password/change', async ({ request, reply }) => {
        sent = { body: await request.json(), auth: request.headers.get('Authorization') };
        return reply.noContent();
      }),
    );
    const { call, logs } = setup('seller');
    const response = await call('password-change', {
      body: JSON.stringify(CHANGE),
      cookie: await sessionCookie('seller', tokens),
    });
    expect(response.status).toBe(204);
    expect(sent).toEqual({
      body: { ...CHANGE, refreshToken: tokens.refreshToken },
      auth: `Bearer ${tokens.accessToken}`,
    });
    expect(setCookies(response)).toEqual([]);
    await expectNoSecrets(response, logs, tokens);
    for (const line of logs) expect(line).not.toContain(CHANGE.newPassword);
  });

  it.each<[ErrorCode, number]>([
    ['INVALID_CURRENT_PASSWORD', 400],
    ['PASSWORD_UNCHANGED', 422],
    ['RATE_LIMITED', 429],
  ])('passes %s through and keeps the session', async (code, status) => {
    server.use(mockApi('post', '/auth/password/change', ({ reply }) => reply.error(status, code)));
    const response = await setup().call('password-change', {
      body: JSON.stringify(CHANGE),
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(status);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(code);
    expect(setCookies(response)).toEqual([]);
  });

  it('INVALID_REFRESH_TOKEN ends the session: 401 passed through, cookies cleared', async () => {
    server.use(
      mockApi('post', '/auth/password/change', ({ reply }) => reply.error(401, 'INVALID_REFRESH_TOKEN')),
    );
    const response = await setup().call('password-change', {
      body: JSON.stringify(CHANGE),
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(401);
    expect(setCookies(response).every((c) => c.attributes.includes('Max-Age=0'))).toBe(true);
  });

  it('without a session, or with an expired access token: 401 UNAUTHENTICATED and no backend call', async () => {
    const none = await setup().call('password-change', { body: JSON.stringify(CHANGE) });
    expect(none.status).toBe(401);
    const expired = await setup('storefront', { now: () => new Date('2026-10-14T09:00:00.000Z') }).call(
      'password-change',
      { body: JSON.stringify(CHANGE), cookie: await sessionCookie('storefront', tokensFor('storefront')) },
    );
    expect(expired.status).toBe(401);
    expect(((await expired.json()) as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects unknown keys, e.g. a refreshToken from the client, without calling the backend', async () => {
    const response = await setup().call('password-change', {
      body: JSON.stringify({ ...CHANGE, refreshToken: 'x'.repeat(43) }),
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/auth/refresh', () => {
  const nearExpiry = new Date('2026-10-14T08:14:30.000Z'); // 30 s left, below the 60 s skew

  it('answers 401 UNAUTHENTICATED without a session, without calling the backend', async () => {
    const response = await setup().call('refresh');
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
    expect(setCookies(response)).toEqual([]);
  });

  it('clears a cookie it cannot read', async () => {
    const response = await setup().call('refresh', { cookie: '__Host-nile_storefront_session=tampered' });
    expect(response.status).toBe(401);
    expect(setCookies(response).map((c) => [c.name, c.attributes.includes('Max-Age=0')])).toEqual([
      ['__Host-nile_storefront_session', true],
      ['__Host-nile_storefront_sv', true],
    ]);
  });

  it("ignores another app's session cookie", async () => {
    const response = await setup('admin').call('refresh', {
      cookie: (await sessionCookie('storefront', tokensFor('storefront'))).replace('storefront', 'admin'),
    });
    expect(response.status).toBe(401);
  });

  it('returns the current expiry without calling the backend while the token is fresh', async () => {
    const tokens = tokensFor('storefront');
    const response = await setup().call('refresh', { cookie: await sessionCookie('storefront', tokens) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { accessTokenExpiresAt: tokens.accessTokenExpiresAt },
    });
    expect(setCookies(response)).toEqual([]);
  });

  it('rotates the tokens near expiry: one backend call with the stored refresh token, new cookies, no token in the body', async () => {
    const current = tokensFor('storefront');
    const next = tokensFor('storefront', {
      accessTokenExpiresAt: '2026-10-14T08:29:30.000Z',
      refreshTokenExpiresAt: '2026-11-13T08:14:30.000Z',
    });
    const presented: string[] = [];
    server.use(
      mockApi('post', '/auth/refresh', async ({ request, reply }) => {
        presented.push(((await request.json()) as { refreshToken: string }).refreshToken);
        return reply.ok(next);
      }),
    );
    const { call, logs } = setup('storefront', { now: () => nearExpiry });
    const response = await call('refresh', { cookie: await sessionCookie('storefront', current) });

    expect(response.status).toBe(200);
    expect(await response.clone().json()).toEqual({
      success: true,
      data: { accessTokenExpiresAt: next.accessTokenExpiresAt },
    });
    expect(presented).toEqual([current.refreshToken]);
    const [session, version] = setCookies(response);
    expect(await unsealSession(session?.value ?? '', KEY_RING, nearExpiry)).toMatchObject({
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
    });
    expect(version?.value).toBe(String(Date.parse(next.accessTokenExpiresAt)));
    await expectNoSecrets(response, logs, next);
    await expectNoSecrets(response, logs, current);
  });

  it('ends the session on INVALID_REFRESH_TOKEN: 401 passed through, cookies cleared', async () => {
    server.use(mockApi('post', '/auth/refresh', ({ reply }) => reply.error(401, 'INVALID_REFRESH_TOKEN')));
    const { call, logs } = setup('storefront', { now: () => nearExpiry });
    const response = await call('refresh', {
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(setCookies(response).every((c) => c.attributes.includes('Max-Age=0'))).toBe(true);
    expect(setCookies(response)).toHaveLength(2);
    expect(logs.some((line) => line.includes('REFRESH_FAILED'))).toBe(true);
  });

  it.each<[ErrorCode, number]>([
    ['RATE_LIMITED', 429],
    ['INTERNAL_ERROR', 500],
  ])('keeps the session on %s', async (code, status) => {
    server.use(mockApi('post', '/auth/refresh', ({ reply }) => reply.error(status, code)));
    const response = await setup('storefront', { now: () => nearExpiry }).call('refresh', {
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(status);
    expect(setCookies(response)).toEqual([]);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token at the backend and clears both cookies', async () => {
    const tokens = tokensFor('storefront');
    const revoked = recordLogout();
    const response = await setup().call('logout', { cookie: await sessionCookie('storefront', tokens) });
    expect(response.status).toBe(204);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(revoked).toEqual([tokens.refreshToken]);
    const cleared = setCookies(response);
    expect(cleared.map((c) => c.name)).toEqual([
      '__Host-nile_storefront_session',
      '__Host-nile_storefront_sv',
    ]);
    expect(cleared.every((c) => c.value === '' && c.attributes.includes('Max-Age=0'))).toBe(true);
  });

  it('still signs out locally when the backend fails', async () => {
    server.use(mockApi('post', '/auth/logout', ({ reply }) => reply.error(500, 'INTERNAL_ERROR')));
    const response = await setup().call('logout', {
      cookie: await sessionCookie('storefront', tokensFor('storefront')),
    });
    expect(response.status).toBe(204);
    expect(setCookies(response)).toHaveLength(2);
  });

  it('clears cookies without a backend call when there is no session', async () => {
    const response = await setup().call('logout');
    expect(response.status).toBe(204);
    expect(setCookies(response)).toHaveLength(2);
  });
});
