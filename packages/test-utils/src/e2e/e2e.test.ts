import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { randomPhone, uniqueEmail } from './accounts';
import { describeResponse, expectData } from './backend';
import { e2eEnv } from './env';
import { createMailpit, EMAIL_SUBJECTS, inviteTokenFromEmail, otpFromEmail } from './mailpit';

const VALID_ENV = {
  NILE_API_BASE_URL: 'http://localhost:3100',
  MAILPIT_URL: 'http://localhost:8025',
  E2E_ADMIN_EMAIL: 'e2e-admin@example.test',
  E2E_ADMIN_PASSWORD: 'local-only-password',
};

describe('e2eEnv', () => {
  it('accepts complete settings', () => {
    expect(e2eEnv(VALID_ENV)).toEqual(VALID_ENV);
  });

  it('names missing or empty keys, never values', () => {
    const run = () => e2eEnv({ ...VALID_ENV, MAILPIT_URL: '', E2E_ADMIN_PASSWORD: undefined });
    expect(run).toThrow('Missing or invalid E2E settings: E2E_ADMIN_PASSWORD, MAILPIT_URL');
    expect(() => e2eEnv({ ...VALID_ENV, E2E_ADMIN_EMAIL: 'secret-value' })).not.toThrow(/secret-value/);
  });
});

describe('email parsing (backend templates)', () => {
  it('reads the code of a verification email', () => {
    const text = 'Use this code to verify your email address:\n\n042517\n\nThe code expires in 10 minutes.';
    expect(otpFromEmail(text)).toBe('042517');
  });

  it('reads the invite token from the link', () => {
    const text =
      "You've been invited to join Nile as an agent.\n\nhttp://localhost:4100/invite?token=abc_DEF-123\n";
    expect(inviteTokenFromEmail(text)).toBe('abc_DEF-123');
  });

  it('fails clearly when nothing matches', () => {
    expect(() => otpFromEmail('no code')).toThrow('No 6-digit code');
    expect(() => inviteTokenFromEmail('http://localhost/invite')).toThrow('No invite link');
  });
});

describe('createMailpit.awaitEmail', () => {
  const MAILPIT = 'http://mailpit.test';
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

  it('ignores emails that existed before the trigger', async () => {
    const messages = [{ ID: 'old', Subject: EMAIL_SUBJECTS.verification }];
    server.use(
      http.get(`${MAILPIT}/api/v1/search`, () => HttpResponse.json({ messages: [...messages] })),
      http.get(`${MAILPIT}/api/v1/message/:id`, ({ params }) =>
        HttpResponse.json({ Text: params.id === 'new' ? '\n111111\n' : '\n999999\n' }),
      ),
    );
    const text = await createMailpit(MAILPIT, 2_000).awaitEmail('a@example.test', 'verification', () => {
      messages.unshift({ ID: 'new', Subject: EMAIL_SUBJECTS.verification });
      return Promise.resolve();
    });
    expect(otpFromEmail(text)).toBe('111111');
  });

  it('times out with the email kind in the message', async () => {
    server.use(http.get(`${MAILPIT}/api/v1/search`, () => HttpResponse.json({ messages: [] })));
    const wait = createMailpit(MAILPIT, 300).awaitEmail('a@example.test', 'invite', () => Promise.resolve());
    await expect(wait).rejects.toThrow('No new "invite" email');
  });
});

describe('backend helpers', () => {
  it('names endpoint, status and code, with a hint on rate limits', () => {
    const limited = {
      method: 'POST' as const,
      path: '/api/v1/auth/login',
      status: 429,
      body: { success: false, error: { code: 'RATE_LIMITED', message: 'x' } },
    };
    expect(describeResponse(limited)).toBe('POST /api/v1/auth/login → 429 RATE_LIMITED');
    expect(() => expectData(limited, 200)).toThrow(/RATE_LIMIT_STRICT_AUTH_POINTS/);
  });

  it('makes unique test data in the backend formats', () => {
    expect(uniqueEmail('seller')).toMatch(/^e2e\+seller-[0-9a-f-]{36}@example\.test$/);
    expect(randomPhone()).toMatch(/^\+20(10|11|12|15)\d{8}$/);
  });
});
