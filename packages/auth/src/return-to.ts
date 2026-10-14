// `returnTo` handling (conventions §2, CLAUDE.md §9.4): only same-origin relative paths are accepted; anything
// else is ignored and the caller uses the role's home. Framework-free, shared by proxy.ts, the DAL and the
// sign-in screens.

const MAX_LENGTH = 2048;
const PLACEHOLDER_ORIGIN = 'http://return-to.invalid';
// eslint-disable-next-line no-control-regex -- control characters are exactly what this rejects
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export interface ReturnToOptions {
  /** Pages that must never be a destination (the sign-in page itself, to avoid loops). */
  exclude?: readonly string[];
}

const isUnder = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);

/**
 * The path to go back to, or null when `value` isn't a safe same-origin relative path: absolute or
 * protocol-relative URLs (`//evil.test`, `/\evil.test`), schemes, control characters, API routes and
 * excluded pages are all refused.
 */
export function safeReturnTo(value: string | null | undefined, options: ReturnToOptions = {}): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_LENGTH) return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  if (CONTROL_CHARACTERS.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return null;
  if (isUnder(url.pathname, '/api')) return null;
  if ((options.exclude ?? []).some((path) => isUnder(url.pathname, path))) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
