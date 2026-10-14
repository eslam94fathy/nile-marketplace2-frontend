import { z } from 'zod';

/**
 * Environment schemas shared by the four apps (CLAUDE.md §11, design 01 §9).
 * Rules: every key is required (no defaults), an empty value counts as missing, and error messages name
 * keys and rules but never values (secrets must not reach logs).
 */

export const APP_NAMES = ['storefront', 'seller', 'admin', 'agent'] as const;
export type AppName = (typeof APP_NAMES)[number];

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug'] as const;

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
const SESSION_KEY_BYTES = 32;
const DIGITS = /^\d+$/;

function isHttpOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
  } catch {
    return false;
  }
}

/** Scheme + host (+ port), nothing else: `https://shop.example.com`, never a path or trailing slash. */
const origin = z
  .string()
  .refine(isHttpOrigin, 'must be an http(s) origin without path or trailing slash, e.g. https://example.com');

/** Whole number from a string; `z.coerce` would turn '' into 0, which would hide a missing value. */
const integer = (min: number, max: number) =>
  z
    .string()
    .regex(DIGITS, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(min, `must be at least ${min}`).max(max, `must be at most ${max}`));

const booleanString = z.enum(['true', 'false'], 'must be "true" or "false"').transform((v) => v === 'true');

// atob, not Buffer: this module is also bundled for the browser (public schema).
function decodesToKeyBytes(base64: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) return false;
  try {
    return atob(base64).length === SESSION_KEY_BYTES;
  } catch {
    return false;
  }
}

/** JSON object `{ "<kid>": "<base64 of 32 random bytes>" }` with at least one entry (key rotation, design 01 §3.1). */
const sessionKeys = z.string().transform((raw, ctx): Record<string, string> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'must be a JSON object of key id → base64 key' });
    return z.NEVER;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    ctx.addIssue({ code: 'custom', message: 'must be a JSON object of key id → base64 key' });
    return z.NEVER;
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'must contain at least one key' });
    return z.NEVER;
  }
  const keys: Record<string, string> = {};
  for (const [kid, key] of entries) {
    if (!KEY_ID_PATTERN.test(kid)) {
      ctx.addIssue({ code: 'custom', message: 'key ids must be 1–32 characters of A–Z a–z 0–9 _ -' });
      return z.NEVER;
    }
    if (typeof key !== 'string' || !decodesToKeyBytes(key)) {
      ctx.addIssue({
        code: 'custom',
        message: `key "${kid}" must be base64 of exactly ${SESSION_KEY_BYTES} bytes`,
      });
      return z.NEVER;
    }
    keys[kid] = key;
  }
  return keys;
});

/** Server-only keys; same set for every app. */
export const serverEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    APP_ORIGIN: origin,
    NILE_API_BASE_URL: origin,
    SESSION_ENCRYPTION_KEYS: sessionKeys,
    SESSION_ACTIVE_KEY_ID: z.string().regex(KEY_ID_PATTERN, 'must be 1–32 characters of A–Z a–z 0–9 _ -'),
    SESSION_COOKIE_SECURE: booleanString,
    REFRESH_SKEW_SECONDS: integer(1, 600),
    BFF_UPSTREAM_TIMEOUT_MS: integer(1000, 60000),
    BFF_MAX_BODY_KB: integer(1, 1024),
    LOG_LEVEL: z.enum(LOG_LEVELS),
  })
  .superRefine((env, ctx) => {
    if (!Object.hasOwn(env.SESSION_ENCRYPTION_KEYS, env.SESSION_ACTIVE_KEY_ID)) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_ACTIVE_KEY_ID'],
        message: 'must be one of the key ids in SESSION_ENCRYPTION_KEYS',
      });
    }
    // Design 01 §3.1 (DQ-3). Origins are not forced to https here: a production build must still run on
    // http://localhost for E2E, where browsers accept Secure cookies; real deployments are https by setup.
    if (env.NODE_ENV === 'production' && !env.SESSION_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'must be "true" in production',
      });
    }
  });
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Public (`NEXT_PUBLIC_*`) keys every app has. Values are inlined into browser bundles: never secrets. */
export function publicEnvSchema<const T extends AppName>(app: T) {
  return z.object({
    NEXT_PUBLIC_APP_NAME: z.literal(app, `must be "${app}" for this app`),
    NEXT_PUBLIC_STOREFRONT_URL: origin,
    NEXT_PUBLIC_SELLER_URL: origin,
    NEXT_PUBLIC_ADMIN_URL: origin,
    NEXT_PUBLIC_AGENT_URL: origin,
    NEXT_PUBLIC_REFRESH_SKEW_SECONDS: integer(1, 600),
  });
}
export type PublicEnv = z.infer<ReturnType<typeof publicEnvSchema>>;

/** Storefront-only public keys (spec 01 SF-Q-5). */
export const storefrontPublicEnvExtension = {
  NEXT_PUBLIC_KASHIER_PAYMENT_WINDOW_MINUTES: integer(1, 120),
};

const OWN_URL_KEY = {
  storefront: 'NEXT_PUBLIC_STOREFRONT_URL',
  seller: 'NEXT_PUBLIC_SELLER_URL',
  admin: 'NEXT_PUBLIC_ADMIN_URL',
  agent: 'NEXT_PUBLIC_AGENT_URL',
} as const satisfies Record<AppName, keyof PublicEnv>;

export class EnvError extends Error {
  override readonly name = 'EnvError';

  constructor(
    readonly scope: string,
    readonly problems: readonly { key: string; reason: string }[],
  ) {
    super(`Invalid ${scope} environment: ${problems.map((p) => `${p.key} ${p.reason}`).join('; ')}`);
  }

  get keys(): string[] {
    return [...new Set(this.problems.map((p) => p.key))];
  }
}

/**
 * Validates `source` (usually `process.env`). Empty strings count as missing. Throws `EnvError` listing
 * every problem by key; values never appear in the error.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Readonly<Record<string, string | undefined>>,
  scope: string,
): z.infer<S> {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value !== '') cleaned[key] = value;
  }
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const key = String(issue.path[0] ?? '(root)');
    const reason = cleaned[key] === undefined ? 'is missing' : issue.message;
    return { key, reason };
  });
  throw new EnvError(scope, problems);
}

/** Rules spanning server and public keys of one app. */
export function checkEnvConsistency(app: AppName, server: ServerEnv, publicEnv: PublicEnv): void {
  const problems: { key: string; reason: string }[] = [];
  const ownUrlKey = OWN_URL_KEY[app];
  if (publicEnv[ownUrlKey] !== server.APP_ORIGIN) {
    problems.push({ key: 'APP_ORIGIN', reason: `must equal ${ownUrlKey}` });
  }
  // The browser refreshes at expiry − its skew; the server refreshes only below its own skew. A larger
  // browser skew would make the server answer "still fresh" and the browser retry in a loop.
  if (publicEnv.NEXT_PUBLIC_REFRESH_SKEW_SECONDS > server.REFRESH_SKEW_SECONDS) {
    problems.push({
      key: 'NEXT_PUBLIC_REFRESH_SKEW_SECONDS',
      reason: 'must not be greater than REFRESH_SKEW_SECONDS',
    });
  }
  if (problems.length > 0) throw new EnvError('combined', problems);
}
