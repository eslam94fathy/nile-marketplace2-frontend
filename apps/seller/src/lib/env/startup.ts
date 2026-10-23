import 'server-only';
import { checkEnvConsistency, EnvError } from '@nile/config/env';
import { APP } from '@/lib/app';
import { publicEnv } from './public';
import { serverEnv } from './server';

/**
 * Called once when the server starts (instrumentation.ts). An invalid environment stops the process with
 * the offending keys (never their values), so a misconfigured deploy fails at boot, not on a request.
 */
export function validateEnvironmentOrExit(): void {
  try {
    checkEnvConsistency(APP.name, serverEnv(), publicEnv);
  } catch (error) {
    if (!(error instanceof EnvError)) throw error;
    // The structured logger arrives with @nile/logger; this is the same JSON line shape.
    process.stderr.write(
      `${JSON.stringify({
        level: 'fatal',
        timestamp: new Date().toISOString(),
        message: 'Invalid environment',
        app: APP.name,
        scope: error.scope,
        problems: error.problems,
      })}\n`,
    );
    process.exit(1);
  }
}
