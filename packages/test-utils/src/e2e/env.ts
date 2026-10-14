import { z } from 'zod';

// Settings for suites that run against a real backend (contract tests, Playwright). No defaults
// (CLAUDE.md §11): a missing key stops the run and the message names the key, never the value.
const E2E_ENV_SCHEMA = z.object({
  /** Backend origin without `/api/v1`, e.g. `http://localhost:3100`. */
  NILE_API_BASE_URL: z.url(),
  /** Mailpit web/API origin, e.g. `http://localhost:8025`. */
  MAILPIT_URL: z.url(),
  /** The test admin, created once with the backend's `seed-admin` command (design 01 R-16). */
  E2E_ADMIN_EMAIL: z.email(),
  /** Password set when the test admin's invite is accepted. Throwaway stacks only. */
  E2E_ADMIN_PASSWORD: z.string().min(8),
});

export type E2eEnv = z.infer<typeof E2E_ENV_SCHEMA>;

export function e2eEnv(source: Readonly<Record<string, string | undefined>> = process.env): E2eEnv {
  const cleaned = Object.fromEntries(
    Object.keys(E2E_ENV_SCHEMA.shape).map((key) => [key, source[key] === '' ? undefined : source[key]]),
  );
  const result = E2E_ENV_SCHEMA.safeParse(cleaned);
  if (result.success) return result.data;
  const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))].sort();
  throw new Error(`Missing or invalid E2E settings: ${keys.join(', ')} (design 01 §12.3)`);
}
