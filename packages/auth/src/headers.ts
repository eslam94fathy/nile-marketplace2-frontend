// Security headers (design 01 §10, CLAUDE.md §9). Framework-free: used by `proxy.ts` (through the route
// guard) for the per-request CSP, and by each app's `next.config.ts` for the static headers on every path.

/** Request header carrying the page's nonce (Next.js also reads it from the request's CSP). */
export const NONCE_HEADER = 'x-nonce';
export const CSP_HEADER = 'Content-Security-Policy';
export const CSP_REPORT_ONLY_HEADER = 'Content-Security-Policy-Report-Only';

const NONCE_BYTES = 16;

/**
 * Whether the page CSP only reports (`Content-Security-Policy-Report-Only`). T-I1 ran report-only first to
 * collect violations, then switched to enforcing (design 01 §10, R-50).
 */
export const CSP_REPORT_ONLY = false;

/** A fresh, unpredictable nonce per request: 128 random bits, base64. */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

export interface CspOptions {
  readonly nonce: string;
  /** `next dev`: React needs `eval` for its debugging aids. */
  readonly development: boolean;
}

/**
 * The page policy (design 01 §10): scripts only with this request's nonce (and what they load,
 * `'strict-dynamic'`); everything else from the app's own origin; no framing, no
 * plugins, no foreign `<base>`, forms only to the app itself. Browsers talk only to their own BFF.
 */
export function contentSecurityPolicy({ nonce, development }: CspOptions): string {
  const directives: readonly (readonly [string, ...string[]])[] = [
    ['default-src', "'self'"],
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(development ? ["'unsafe-eval'"] : []),
    ],
    // Styles: inline allowed, no nonce (a nonce would make browsers ignore 'unsafe-inline'). The report-only
    // run found Radix `style` attributes in server HTML and scroll-lock `<style>` elements without a nonce
    // (design 01 §10 rule, R-50). Inline styles can't run code; scripts stay nonce-only.
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'", ...(development ? ['ws:'] : [])],
    ['frame-ancestors', "'none'"],
    ['form-action', "'self'"],
    ['base-uri', "'self'"],
    ['object-src', "'none'"],
  ];
  return directives.map((directive) => directive.join(' ')).join('; ');
}

/** One year, as design 01 §10 (production only: development runs on plain http://localhost). */
const HSTS_MAX_AGE_SECONDS = 31_536_000;

/**
 * The static headers for every response of an app (pages, `/api/*`, assets), from `next.config.ts`
 * `headers()`. `Cache-Control: no-store` is not here: route handlers and authenticated pages set it.
 */
export function staticSecurityHeaders({ production }: { readonly production: boolean }) {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    // For browsers without CSP `frame-ancestors`.
    { key: 'X-Frame-Options', value: 'DENY' },
    ...(production
      ? [{ key: 'Strict-Transport-Security', value: `max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains` }]
      : []),
  ];
}
