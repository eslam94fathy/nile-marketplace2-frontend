import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { cookieNames } from './cookies';
import { createRouteGuard, PATHNAME_HEADER, type RouteGuardConfig } from './route-guard';
import { APP_ORIGIN, KEY_RING, NOW, sessionCookie, setCookies, tokensFor } from './test/fixtures';

const PORTAL_PUBLIC = ['/login', '/register', '/forgot-password'];

const config = (overrides: Partial<RouteGuardConfig> = {}): RouteGuardConfig => ({
  app: 'seller',
  sessionKeys: KEY_RING,
  cookieSecure: true,
  loginPath: '/login',
  homePath: '/',
  isProtectedPath: (pathname) => !PORTAL_PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`)),
  signedInRedirectPaths: ['/login', '/register'],
  now: () => NOW,
  ...overrides,
});

async function run(
  path: string,
  cookie?: string,
  guardConfig = config(),
  headers: Record<string, string> = {},
) {
  const request = new NextRequest(`${APP_ORIGIN}${path}`, {
    headers: { ...headers, ...(cookie === undefined ? {} : { Cookie: cookie }) },
  });
  return createRouteGuard(() => guardConfig)(request);
}

const location = (response: Response) => response.headers.get('Location');
/** Request header handed to the page (NextResponse.next({ request: { headers } })). */
const forwarded = (response: Response, name: string) => response.headers.get(`x-middleware-request-${name}`);

const sellerCookie = () => sessionCookie('seller', tokensFor('seller'));

describe('route guard (proxy.ts)', () => {
  it('sends a signed-out visitor of a protected page to sign-in with returnTo = path + query', async () => {
    const response = await run('/orders?status=placed&page=2');
    expect(response.status).toBe(307);
    expect(location(response)).toBe(`${APP_ORIGIN}/login?returnTo=%2Forders%3Fstatus%3Dplaced%26page%3D2`);
  });

  it('protects the portal home too', async () => {
    expect(location(await run('/'))).toBe(`${APP_ORIGIN}/login?returnTo=%2F`);
  });

  it('drops the internal _rsc parameter from returnTo', async () => {
    expect(location(await run('/orders?_rsc=abc123&tab=new'))).toBe(
      `${APP_ORIGIN}/login?returnTo=%2Forders%3Ftab%3Dnew`,
    );
  });

  it('lets a signed-out visitor see public pages and passes the page path to the DAL', async () => {
    const response = await run('/forgot-password?email=a%40b.test');
    expect(location(response)).toBeNull();
    expect(forwarded(response, PATHNAME_HEADER)).toBe('/forgot-password?email=a%40b.test');
  });

  it('lets a signed-in user through and overwrites a client-supplied path header', async () => {
    const response = await run('/orders', await sellerCookie(), config(), {
      [PATHNAME_HEADER]: '//evil.test',
    });
    expect(location(response)).toBeNull();
    expect(forwarded(response, PATHNAME_HEADER)).toBe('/orders');
    expect(setCookies(response)).toEqual([]);
  });

  it('sends a signed-in user away from sign-in and registration: to a safe returnTo, else home', async () => {
    const cookie = await sellerCookie();
    expect(location(await run('/login?returnTo=%2Forders%3Ftab%3Dnew', cookie))).toBe(
      `${APP_ORIGIN}/orders?tab=new`,
    );
    expect(location(await run('/register', cookie))).toBe(`${APP_ORIGIN}/`);
    for (const unsafe of [
      'https://evil.test',
      '//evil.test',
      '/\\evil.test',
      '/login',
      '/register?x=1',
      '/api/bff/me',
    ]) {
      const response = await run(`/login?returnTo=${encodeURIComponent(unsafe)}`, cookie);
      expect(location(response), unsafe).toBe(`${APP_ORIGIN}/`);
    }
  });

  it('treats an unusable cookie as signed out and deletes it, so a stale cookie cannot loop', async () => {
    const names = cookieNames('seller', true);
    for (const cookie of [
      `${names.session}=tampered`,
      await sessionCookie('seller', tokensFor('storefront')), // another role
      await sessionCookie('seller', tokensFor('seller'), {
        keys: { old: Buffer.alloc(32, 7).toString('base64') },
        activeKeyId: 'old',
      }), // key removed from the ring
    ]) {
      const protectedPage = await run('/orders', cookie);
      expect(location(protectedPage)).toBe(`${APP_ORIGIN}/login?returnTo=%2Forders`);
      expect(setCookies(protectedPage).map((c) => [c.name, c.attributes.includes('Max-Age=0')])).toEqual([
        [names.session, true],
        [names.sessionVersion, true],
      ]);
      // The sign-in page then renders (no redirect back to home).
      const login = await run('/login?returnTo=%2Forders', cookie);
      expect(location(login)).toBeNull();
      expect(setCookies(login)).toHaveLength(2);
    }
  });

  it('treats a session past its refresh-token expiry as signed out', async () => {
    const guard = config({ now: () => new Date('2026-11-14T00:00:00.000Z') });
    expect(location(await run('/orders', await sellerCookie(), guard))).toBe(
      `${APP_ORIGIN}/login?returnTo=%2Forders`,
    );
  });

  it('keeps a session whose access token expired (refresh happens in the browser, never here)', async () => {
    const guard = config({ now: () => new Date('2026-10-14T09:00:00.000Z') });
    const response = await run('/orders', await sellerCookie(), guard);
    expect(location(response)).toBeNull();
    expect(setCookies(response)).toEqual([]);
  });

  it('on the storefront, only the customer pages are protected', async () => {
    const storefront = config({
      app: 'storefront',
      isProtectedPath: (p) =>
        ['/cart', '/checkout', '/account'].some((x) => p === x || p.startsWith(`${x}/`)),
    });
    expect(location(await run('/p/red-shirt', undefined, storefront))).toBeNull();
    expect(location(await run('/account/orders/1', undefined, storefront))).toBe(
      `${APP_ORIGIN}/login?returnTo=%2Faccount%2Forders%2F1`,
    );
  });
});
