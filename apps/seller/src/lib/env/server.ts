import 'server-only';
import { parseEnv, serverEnvSchema, type ServerEnv } from '@nile/config/env';

let cached: ServerEnv | undefined;

/**
 * Server-only settings (secrets included). Read at runtime, never inlined into bundles; importing this
 * module from a client component fails the build (`server-only`). Validated once at startup
 * (instrumentation.ts), then served from memory.
 */
export function serverEnv(): ServerEnv {
  cached ??= parseEnv(serverEnvSchema, process.env, 'server');
  return cached;
}
