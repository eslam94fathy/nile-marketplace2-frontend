import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDal } from './dal';
import { PATHNAME_HEADER, type RouteGuardConfig } from './route-guard';
import { NO_EXTRA_ORIGINS } from './headers';
import { KEY_RING, NOW, sessionCookie, tokensFor } from './test/fixtures';

const state = vi.hoisted(() => ({ cookie: '', pathname: null as string | null }));

vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const [cookieName, ...rest] = state.cookie.split('=');
        return cookieName === name ? { name, value: rest.join('=') } : undefined;
      },
    }),
  headers: () =>
    Promise.resolve(new Headers(state.pathname === null ? {} : { [PATHNAME_HEADER]: state.pathname })),
}));

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const config = (overrides: Partial<RouteGuardConfig> = {}): RouteGuardConfig => ({
  app: 'admin',
  sessionKeys: KEY_RING,
  cookieSecure: true,
  loginPath: '/login',
  homePath: '/',
  isProtectedPath: () => true,
  signedInRedirectPaths: ['/login'],
  csp: { development: false, reportOnly: false, origins: NO_EXTRA_ORIGINS },
  now: () => NOW,
  ...overrides,
});

async function redirectOf(call: Promise<unknown>): Promise<string> {
  try {
    await call;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error('expected a redirect');
}

beforeEach(() => {
  state.cookie = '';
  state.pathname = null;
});

describe('DAL', () => {
  it('returns the signed-in user and never the tokens', async () => {
    const tokens = tokensFor('admin');
    state.cookie = await sessionCookie('admin', tokens);
    const session = await createDal(() => config()).requireSession();
    expect(session).toEqual({ user: tokens.user, accessTokenExpired: false });
    expect(JSON.stringify(session)).not.toContain(tokens.accessToken);
  });

  it('flags an expired access token without redirecting (the browser refreshes)', async () => {
    state.cookie = await sessionCookie('admin', tokensFor('admin'));
    const dal = createDal(() => config({ now: () => new Date('2026-10-14T09:00:00.000Z') }));
    expect((await dal.requireSession()).accessTokenExpired).toBe(true);
  });

  it('redirects to sign-in with the page from proxy.ts as returnTo', async () => {
    state.pathname = '/sellers?status=pending_approval';
    expect(await redirectOf(createDal(() => config()).requireSession())).toBe(
      '/login?returnTo=%2Fsellers%3Fstatus%3Dpending_approval',
    );
  });

  it('redirects without returnTo when the path is missing or unsafe', async () => {
    expect(await redirectOf(createDal(() => config()).requireSession())).toBe('/login');
    state.pathname = '//evil.test';
    expect(await redirectOf(createDal(() => config()).requireSession())).toBe('/login');
  });

  it.each([
    ['a tampered cookie', () => Promise.resolve('__Host-nile_admin_session=tampered')],
    ['another role', () => sessionCookie('admin', tokensFor('seller'))],
  ])('treats %s as signed out', async (_, cookie) => {
    state.cookie = await cookie();
    const dal = createDal(() => config());
    expect(await dal.readSession()).toBeNull();
    expect(await redirectOf(dal.requireSession())).toBe('/login');
  });
});
