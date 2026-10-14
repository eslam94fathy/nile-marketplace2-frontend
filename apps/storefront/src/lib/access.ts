// Which pages need a signed-in customer (spec 01 §2.4). Used by the session coordinator now and by
// proxy.ts / the DAL in T-D3.

/** This app's sign-in page. */
export const LOGIN_PATH = '/login';

/** Route prefixes that need a customer session; every other page is public. */
export const PROTECTED_PATH_PREFIXES = ['/cart', '/checkout', '/account'] as const;

const matches = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATH_PREFIXES.some((path) => matches(pathname, path));
}
