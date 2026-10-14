import 'server-only';
import { createLogger, type Logger } from '@nile/logger';
import { APP } from '@/lib/app';
import { serverEnv } from '@/lib/env/server';

let cached: Logger | undefined;

/** This app's server logger: JSON lines with the redaction list applied (design 01 §11). */
export function logger(): Logger {
  if (cached === undefined) {
    const env = serverEnv();
    cached = createLogger({ app: APP.name, level: env.LOG_LEVEL, env: env.NODE_ENV });
  }
  return cached;
}
