import 'server-only';
import type { RouteGuardConfig } from '@nile/auth/server';
import { HOME_PATH, isProtectedPath, LOGIN_PATH, SIGNED_IN_REDIRECT_PATHS } from '@/lib/access';
import { APP } from '@/lib/app';
import { serverEnv } from '@/lib/env/server';

let cached: RouteGuardConfig | undefined;

/** Settings of proxy.ts and the DAL (design 01 §3.2, §4.4). Read on first use. */
export function guardConfig(): RouteGuardConfig {
  if (cached === undefined) {
    const env = serverEnv();
    cached = {
      app: APP.name,
      sessionKeys: { keys: env.SESSION_ENCRYPTION_KEYS, activeKeyId: env.SESSION_ACTIVE_KEY_ID },
      cookieSecure: env.SESSION_COOKIE_SECURE,
      loginPath: LOGIN_PATH,
      homePath: HOME_PATH,
      isProtectedPath,
      signedInRedirectPaths: SIGNED_IN_REDIRECT_PATHS,
    };
  }
  return cached;
}
