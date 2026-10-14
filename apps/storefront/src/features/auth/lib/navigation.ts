import { safeReturnTo } from '@nile/auth/client';
import { AUTH_PATHS, ROUTES } from '@/lib/routes';

/** Where to go after signing in: the validated `returnTo`, else home (spec 01 §5, conventions §2). */
export function destinationAfterSignIn(returnTo: string | null): string {
  return safeReturnTo(returnTo, { exclude: AUTH_PATHS }) ?? ROUTES.home;
}

/**
 * A full page load after the session changes: every server component and client query starts from the new
 * session, and nothing cached for the previous visitor survives (design 02 §3.1).
 */
export function loadPage(url: string): void {
  window.location.assign(url);
}

/** Removes a one-off query parameter from the address bar without a navigation (e.g. `sent=1`). */
export function dropQueryParam(name: string): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
