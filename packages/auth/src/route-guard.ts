import type { BffApp } from '@nile/api';
import { NextResponse, type NextRequest } from 'next/server';
import { APP_ROLES } from './config';
import { clearSessionCookies, cookieNames } from './cookies';
import {
  contentSecurityPolicy,
  createNonce,
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  NONCE_HEADER,
} from './headers';
import { safeReturnTo } from './return-to';
import { unsealSession, type SessionKeyRing, type SessionV1 } from './session';

// Route protection (design 01 §4.4, architecture §5.5): proxy.ts redirects optimistically (no network call),
// the DAL checks again in every protected Server Component, the backend decides in the end.

/** Request header proxy.ts sets to the page's path + query, so the DAL can build `returnTo`. */
export const PATHNAME_HEADER = 'x-nile-pathname';
export const RETURN_TO_PARAM = 'returnTo';
/** Next.js's internal RSC cache-busting parameter; never part of a page address. */
const RSC_PARAM = '_rsc';

export interface RouteGuardConfig {
  app: BffApp;
  sessionKeys: SessionKeyRing;
  cookieSecure: boolean;
  loginPath: string;
  /** The role's landing page, used when there is no safe `returnTo`. */
  homePath: string;
  isProtectedPath: (pathname: string) => boolean;
  /** Pages a signed-in user is sent away from (sign-in, registration). */
  signedInRedirectPaths: readonly string[];
  /** The page CSP (design 01 §10, T-I1). */
  csp: {
    /** `next dev` relaxes the policy for React's debugging aids (`unsafe-eval`, inline dev styles). */
    development: boolean;
    /** Report violations without blocking: the T-I1 evidence run before enforcing. */
    reportOnly: boolean;
  };
  /** Tests only: fixed clock. */
  now?: () => Date;
}

/** The session in `cookie` when it is valid and belongs to this app's role, else null. */
export async function sessionFromCookie(cookie: string, config: RouteGuardConfig): Promise<SessionV1 | null> {
  const session = await unsealSession(cookie, config.sessionKeys, config.now?.() ?? new Date());
  return session?.user.role === APP_ROLES[config.app] ? session : null;
}

/** `/login?returnTo=<path>` when `currentPath` is a safe destination, else plain `/login`. */
export function loginRedirectPath(config: RouteGuardConfig, currentPath: string | null): string {
  const returnTo = safeReturnTo(currentPath, { exclude: [config.loginPath] });
  if (returnTo === null) return config.loginPath;
  return `${config.loginPath}?${new URLSearchParams({ [RETURN_TO_PARAM]: returnTo }).toString()}`;
}

function currentPathOf(url: URL): string {
  const params = new URLSearchParams(url.search);
  params.delete(RSC_PARAM);
  const query = params.toString();
  return query === '' ? url.pathname : `${url.pathname}?${query}`;
}

const isUnder = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

/**
 * `proxy.ts`: `export const proxy = createRouteGuard(guardConfig)`. Signed out on a protected page → sign-in
 * with `returnTo`; signed in on a sign-in page → `returnTo` or home. The cookie is decrypted locally (no
 * backend call, no refresh); an unusable cookie is deleted, so a stale one can't cause a redirect loop
 * (decided 2026-10-14, design 01 R-22). Every page response carries a fresh CSP nonce (T-I1): set on the
 * forwarded request, where Next.js reads it for its own scripts and styles, and on the response.
 */
export function createRouteGuard(getConfig: () => RouteGuardConfig) {
  return async function proxy(request: NextRequest): Promise<NextResponse> {
    const config = getConfig();
    const names = cookieNames(config.app, config.cookieSecure);
    const raw = request.cookies.get(names.session)?.value;
    const session = raw === undefined || raw === '' ? null : await sessionFromCookie(raw, config);
    const { pathname } = request.nextUrl;
    const currentPath = currentPathOf(request.nextUrl);
    const nonce = createNonce();
    const csp = contentSecurityPolicy({ nonce, development: config.csp.development });
    const cspHeader = config.csp.reportOnly ? CSP_REPORT_ONLY_HEADER : CSP_HEADER;

    let response: NextResponse;
    if (session === null && config.isProtectedPath(pathname)) {
      response = NextResponse.redirect(new URL(loginRedirectPath(config, currentPath), request.url));
    } else if (session !== null && config.signedInRedirectPaths.some((path) => isUnder(pathname, path))) {
      const target =
        safeReturnTo(request.nextUrl.searchParams.get(RETURN_TO_PARAM), {
          exclude: config.signedInRedirectPaths,
        }) ?? config.homePath;
      response = NextResponse.redirect(new URL(target, request.url));
    } else {
      // Always overwritten, so a client can't supply its own value.
      const headers = new Headers(request.headers);
      headers.set(PATHNAME_HEADER, currentPath);
      headers.set(NONCE_HEADER, nonce);
      // Next.js extracts the nonce from the request's policy, whichever of the two headers it is.
      headers.set(CSP_HEADER, csp);
      response = NextResponse.next({ request: { headers } });
    }

    response.headers.set(cspHeader, csp);
    if (raw !== undefined && session === null) {
      clearSessionCookies(response, { names, secure: config.cookieSecure });
    }
    return response;
  };
}
