// Which pages need a signed-in seller (spec 02 §2.3). Used by the session coordinator now and by
// proxy.ts / the DAL in T-D3.

/** This app's sign-in page. */
export const LOGIN_PATH = '/login';

/** Sign-in pages; every other page needs a seller session. */
export const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
] as const;

const matches = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

export function isProtectedPath(pathname: string): boolean {
  return !PUBLIC_PATHS.some((path) => matches(pathname, path));
}
