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

/** Hosts beyond the app's own origin that its pages use (design 01 §15.7), from the app's settings. */
export interface CspOrigins {
  /** Image hosts: the media CDN, and the presigned private-image host where the app shows private images. */
  readonly images: readonly string[];
  /** Hosts the browser posts files to directly (presigned uploads); none for an app that uploads nothing. */
  readonly uploads: readonly string[];
  /** The realtime service's http(s) origin; the policy allows its WebSocket form. */
  readonly realtime: string | null;
}

/** No host beyond the app's own origin. */
export const NO_EXTRA_ORIGINS: CspOrigins = { images: [], uploads: [], realtime: null };

export interface CspOptions {
  readonly nonce: string;
  /** `next dev`: React needs `eval` for its debugging aids. */
  readonly development: boolean;
  readonly origins: CspOrigins;
}

/** `https://api.example.com` → `wss://api.example.com` (the socket uses WebSocket only, design 01 §15.3). */
export function webSocketOrigin(origin: string): string {
  const url = new URL(origin);
  return `${url.protocol === 'https:' ? 'wss:' : 'ws:'}//${url.host}`;
}

/** Sources in order, each once (the same storage host often serves uploads and private images). */
const unique = (sources: readonly string[]): string[] => [...new Set(sources)];

/**
 * The page policy (design 01 §10, §15.7): scripts only with this request's nonce (and what they load,
 * `'strict-dynamic'`); everything else from the app's own origin, except the configured media hosts (images,
 * direct uploads, local `blob:` previews where the app uploads) and the realtime socket; the push service worker
 * and the manifest from the app itself; no framing, no plugins, no foreign `<base>`, forms only to the app
 * itself. API calls still go only to the app's own BFF.
 */
export function contentSecurityPolicy({ nonce, development, origins }: CspOptions): string {
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
    [
      'img-src',
      ...unique(["'self'", 'data:', ...(origins.uploads.length > 0 ? ['blob:'] : []), ...origins.images]),
    ],
    ['font-src', "'self'"],
    [
      'connect-src',
      ...unique([
        "'self'",
        ...origins.uploads,
        ...(origins.realtime === null ? [] : [webSocketOrigin(origins.realtime)]),
        ...(development ? ['ws:'] : []),
      ]),
    ],
    ['worker-src', "'self'"],
    ['manifest-src', "'self'"],
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
