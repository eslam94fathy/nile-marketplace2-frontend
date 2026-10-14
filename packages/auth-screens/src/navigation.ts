import { safeReturnTo } from '@nile/auth/client';

/** Where to go after signing in: the validated `returnTo` (never a sign-in screen), else the role's home. */
export function destinationAfterSignIn(
  returnTo: string | null,
  authPaths: readonly string[],
  home: string,
): string {
  return safeReturnTo(returnTo, { exclude: authPaths }) ?? home;
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
