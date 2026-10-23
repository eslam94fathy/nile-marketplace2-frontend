/** Next.js calls register() once per server start (dev and production), before any request is handled. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { validateEnvironmentOrExit } = await import('./lib/env/startup');
  validateEnvironmentOrExit();
}
