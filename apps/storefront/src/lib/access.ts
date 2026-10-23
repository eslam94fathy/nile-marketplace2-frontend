// Which pages need a signed-in customer (spec 01 §2.4). Used by the session coordinator now and by
// proxy.ts and the DAL.

/** This app's sign-in page. */
export const LOGIN_PATH = '/login';

/** The role's landing page: after sign-in without a safe `returnTo`. */
export const HOME_PATH = '/';

/** Where a protected page goes after the user signs out (conventions §2). */
export const SIGNED_OUT_PATH = '/';

/** Pages a signed-in user is sent away from (sign-in and registration). */
export const SIGNED_IN_REDIRECT_PATHS = ['/login', '/register'] as const;

/** Route prefixes that need a customer session; every other page is public. */
export const PROTECTED_PATH_PREFIXES = ['/cart', '/checkout', '/account'] as const;

const matches = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((path) => matches(pathname, path));
}
