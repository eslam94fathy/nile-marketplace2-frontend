// Which pages need a signed-in delivery agent (spec 04 §2). Used by the session coordinator now and by
// proxy.ts and the DAL.

/** This app's sign-in page. */
export const LOGIN_PATH = '/login';

/** The role's landing page: after sign-in without a safe `returnTo`. */
export const HOME_PATH = '/';

/** Where a protected page goes after the user signs out (conventions §2). */
export const SIGNED_OUT_PATH = LOGIN_PATH;

/** Pages a signed-in user is sent away from (sign-in). */
export const SIGNED_IN_REDIRECT_PATHS = ['/login'] as const;

/** Sign-in pages; every other page needs a delivery agent session. */
export const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'] as const;

const matches = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export function isProtectedPath(pathname: string): boolean {
  return !PUBLIC_PATHS.some((path) => matches(pathname, path));
}
