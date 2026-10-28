import type { APIRequestContext, APIResponse } from '@playwright/test';
import { appUrl, type E2eAppName } from '../apps';
import { expect, test } from './index';

// T-I1 hardening checks per app (design 01 §4.3, §10; architecture §5.6): security headers on pages and
// `/api/*`, a fresh CSP nonce that Next.js puts on its own scripts, CSRF refusals on the auth routes, and
// session abuse (a tampered cookie, another role's session) ending signed out with the cookie deleted.

/** A page that needs this app's session (spec route maps). */
const PROTECTED_PATH: Readonly<Record<E2eAppName, string>> = {
  storefront: '/account',
  seller: '/',
  admin: '/',
  agent: '/',
};

/** An app whose role can't use `app`: its session is planted under `app`'s cookie name. */
const OTHER_APP: Readonly<Record<E2eAppName, E2eAppName>> = {
  storefront: 'seller',
  seller: 'storefront',
  admin: 'storefront',
  agent: 'storefront',
};

/** E2E runs the production build with secure cookies (playwright.config.ts). */
const sessionCookie = (app: E2eAppName) => `__Host-nile_${app}_session`;

const STATIC_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
  'x-frame-options': 'DENY',
} as const;

function expectStaticHeaders(response: APIResponse) {
  const headers = response.headers();
  for (const [name, value] of Object.entries(STATIC_HEADERS)) expect(headers[name], name).toBe(value);
  expect(headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
}

export function securityTests(app: E2eAppName): void {
  const origin = appUrl(app);
  const loginBody = { email: 'nobody@example.test', password: 'not-a-real-password' };

  test.describe(`${app}: security headers and abuse (T-I1)`, () => {
    test('the push service worker: static security headers and checked for updates on every load (design 01 §15.5)', async ({
      request,
    }) => {
      const response = await request.get(`${origin}/sw.js`);
      expect(response.status()).toBe(200);
      expectStaticHeaders(response);
      expect(response.headers()['cache-control']).toBe('no-cache');
      expect(response.headers()['content-type']).toContain('javascript');
    });

    test('a page: enforced CSP with a fresh nonce on every request, carried by the server-sent scripts', async ({
      request,
    }) => {
      const nonceOf = (policy: string | undefined) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1];
      const first = await request.get(`${origin}/login`);
      const second = await request.get(`${origin}/login`);
      expectStaticHeaders(first);
      const policy = first.headers()['content-security-policy'];
      expect(policy).toContain("script-src 'self' 'nonce-");
      expect(policy).toContain("'strict-dynamic'");
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("object-src 'none'");
      // Release 2 (design 01 §15.7): the push service worker and the manifest come from the app itself.
      expect(policy).toContain("worker-src 'self'");
      expect(policy).toContain("manifest-src 'self'");
      expect(policy).not.toContain('unsafe-eval');
      expect(first.headers()['content-security-policy-report-only']).toBeUndefined();
      expect(nonceOf(second.headers()['content-security-policy'])).not.toBe(nonceOf(policy));

      // Every script tag in the server's HTML carries this response's nonce (chunks loaded later inherit
      // the trust through 'strict-dynamic' and have none).
      const nonce = nonceOf(policy);
      const scriptTags = (await first.text()).match(/<script(?=[\s>])[^>]*>/g) ?? [];
      expect(scriptTags.length).toBeGreaterThan(0);
      for (const tag of scriptTags) expect(tag).toContain(`nonce="${nonce ?? ''}"`);
    });

    test('`/api/*`: static headers and never cached', async ({ request }) => {
      const response = await request.post(`${origin}/api/auth/login`, { data: loginBody });
      expectStaticHeaders(response);
      expect(response.headers()['cache-control']).toBe('no-store');
    });

    test('CSRF: the auth routes refuse a missing or foreign Origin and a missing client header', async ({
      request,
    }) => {
      const attempts = [
        { name: 'no Origin', headers: { 'X-Nile-Client': '1' } },
        { name: 'foreign Origin', headers: { Origin: 'https://evil.test', 'X-Nile-Client': '1' } },
        { name: 'another app', headers: { Origin: appUrl(OTHER_APP[app]), 'X-Nile-Client': '1' } },
        { name: 'no client header', headers: { Origin: origin } },
      ];
      for (const attempt of attempts) {
        const response = await request.post(`${origin}/api/auth/login`, {
          headers: attempt.headers,
          data: loginBody,
        });
        expect(response.status(), attempt.name).toBe(403);
        expect(((await response.json()) as { error: { code: string } }).error.code, attempt.name).toBe(
          'CSRF_REJECTED',
        );
      }
    });

    /** A signed-out answer: sent to sign-in, and the session cookie deleted (design 01 R-22). */
    async function expectRefused(cookieValue: string, request: APIRequestContext) {
      const response = await request.get(`${origin}${PROTECTED_PATH[app]}`, {
        headers: { Cookie: `${sessionCookie(app)}=${cookieValue}` },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(307);
      expect(response.headers().location).toMatch(/\/login(\?|$)/);
      const cleared = response
        .headersArray()
        .filter((header) => header.name.toLowerCase() === 'set-cookie')
        .map((header) => header.value)
        .find((value) => value.startsWith(`${sessionCookie(app)}=`));
      expect(cleared, 'the session cookie is deleted').toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    }

    test('a tampered session cookie is treated as signed out and deleted', async ({ request }) => {
      await expectRefused('v1.tampered.value', request);
    });

    test("another role's session is refused, even under this app's cookie name", async ({
      context,
      request,
      signIn,
    }) => {
      await signIn(OTHER_APP[app]);
      const foreign = (await context.cookies(appUrl(OTHER_APP[app]))).find(
        (cookie) => cookie.name === sessionCookie(OTHER_APP[app]),
      );
      expect(foreign, 'the other app signed in').toBeDefined();
      await expectRefused(foreign?.value ?? '', request);
    });
  });
}
