import 'server-only';
import type { AuthAppConfig } from '@nile/auth/server';
import { APP } from '@/lib/app';
import { serverEnv } from '@/lib/env/server';
import { logger } from './logger';

const BYTES_PER_KB = 1024;

let cached: AuthAppConfig | undefined;

/** Settings of the auth and BFF routes, from the validated server env (design 01 §4, §9). Read on first use. */
export function authConfig(): AuthAppConfig {
  if (cached === undefined) {
    const env = serverEnv();
    cached = {
      app: APP.name,
      appOrigin: env.APP_ORIGIN,
      apiBaseUrl: env.NILE_API_BASE_URL,
      sessionKeys: { keys: env.SESSION_ENCRYPTION_KEYS, activeKeyId: env.SESSION_ACTIVE_KEY_ID },
      cookieSecure: env.SESSION_COOKIE_SECURE,
      refreshSkewSeconds: env.REFRESH_SKEW_SECONDS,
      upstreamTimeoutMs: env.BFF_UPSTREAM_TIMEOUT_MS,
      maxBodyBytes: env.BFF_MAX_BODY_KB * BYTES_PER_KB,
      logger: logger(),
    };
  }
  return cached;
}
