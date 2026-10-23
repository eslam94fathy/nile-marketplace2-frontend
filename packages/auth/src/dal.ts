import type { Route } from 'next';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { cookieNames } from './cookies';
import { loginRedirectPath, PATHNAME_HEADER, sessionFromCookie, type RouteGuardConfig } from './route-guard';
import type { SessionUser } from './session';
import { accessTokenRemainingMs } from './session';

// Data access layer for sessions (design 01 §3.2, architecture §5.5): every protected Server Component calls
// requireSession() itself; proxy.ts is only the optimistic first layer.

export interface CurrentSession {
  user: SessionUser;
  /**
   * The access token has expired: a page that fetches on the server renders `<SessionExpiredBoundary/>`
   * instead (Server Components never refresh). The token itself is not exposed here, so a page can't pass it
   * to a client component by mistake; server-side API calls get it from their own helper (phase e).
   */
  accessTokenExpired: boolean;
}

export interface Dal {
  /** The signed-in user of this request, or null. Cached per request. */
  readSession: () => Promise<CurrentSession | null>;
  /** The signed-in user, or a redirect to sign-in with `returnTo` = the current page. */
  requireSession: () => Promise<CurrentSession>;
}

export function createDal(getConfig: () => RouteGuardConfig): Dal {
  const readSession = cache(async (): Promise<CurrentSession | null> => {
    // cookies() first: it makes the page dynamic, so server settings are never read while prerendering.
    const store = await cookies();
    const config = getConfig();
    const raw = store.get(cookieNames(config.app, config.cookieSecure).session)?.value;
    if (raw === undefined || raw === '') return null;
    const session = await sessionFromCookie(raw, config);
    if (session === null) return null;
    return {
      user: session.user,
      accessTokenExpired: accessTokenRemainingMs(session, config.now?.() ?? new Date()) <= 0,
    };
  });

  const requireSession = async (): Promise<CurrentSession> => {
    const session = await readSession();
    if (session !== null) return session;
    const currentPath = (await headers()).get(PATHNAME_HEADER);
    // Built at runtime from a validated path, so typed routes can't check it statically. The assertion is a
    // no-op when this package is linted alone, but required when an app with `typedRoutes` compiles it.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    redirect(loginRedirectPath(getConfig(), currentPath) as Route);
  };

  return { readSession, requireSession };
}
