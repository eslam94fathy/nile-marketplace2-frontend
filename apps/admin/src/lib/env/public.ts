import { parseEnv } from '@nile/config/env';
import { publicEnvSchemaForApp } from './public-schema';

/**
 * Public settings, safe in the browser. Next.js inlines NEXT_PUBLIC_* values at build time only when each one
 * is written out as a literal `process.env.NEXT_PUBLIC_X` access, so the object is spelled out key by key.
 */
export const publicEnv = parseEnv(
  publicEnvSchemaForApp,
  {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_STOREFRONT_URL: process.env.NEXT_PUBLIC_STOREFRONT_URL,
    NEXT_PUBLIC_SELLER_URL: process.env.NEXT_PUBLIC_SELLER_URL,
    NEXT_PUBLIC_ADMIN_URL: process.env.NEXT_PUBLIC_ADMIN_URL,
    NEXT_PUBLIC_AGENT_URL: process.env.NEXT_PUBLIC_AGENT_URL,
    NEXT_PUBLIC_REFRESH_SKEW_SECONDS: process.env.NEXT_PUBLIC_REFRESH_SKEW_SECONDS,
  },
  'public',
);
