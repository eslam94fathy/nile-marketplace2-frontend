import type { Account } from '@nile/test-utils/e2e';
import type { BrowserContext } from '@playwright/test';
import { appUrl, type E2eAppName } from '../apps';
import { expect } from './index';

// Cross-role sessions (T-O4, TO-Q4): one browser context signed in to several apps, each as a given account.
// Each app has its own session cookie (`__Host-nile_<app>_session`), so the four sessions live side by side.

const bffHeaders = (origin: string) => ({ Origin: origin, 'X-Nile-Client': '1' });

/**
 * Signs `context` in to `app` as `account` through the app's BFF and returns the session's current access
 * token (from `POST /api/auth/realtime-token`), so API set-up in long tests never uses an expired token
 * and costs no extra backend sign-in (strict-auth rate limits).
 */
export async function signInAs(context: BrowserContext, app: E2eAppName, account: Account): Promise<string> {
  const origin = appUrl(app);
  const login = await context.request.post(`${origin}/api/auth/login`, {
    headers: bffHeaders(origin),
    data: { email: account.email, password: account.password },
  });
  expect(login.status(), `sign-in to ${app} as ${account.email}`).toBe(200);
  return currentToken(context, app);
}

/** The access token of `context`'s session in `app` (the BFF refreshes it on the next page load when close to expiry). */
export async function currentToken(context: BrowserContext, app: E2eAppName): Promise<string> {
  const origin = appUrl(app);
  let response = await context.request.post(`${origin}/api/auth/realtime-token`, {
    headers: bffHeaders(origin),
  });
  if (response.status() === 401) {
    // Close to expiry: the route never refreshes (design 01 §15.2), so refresh first, then ask again.
    const refresh = await context.request.post(`${origin}/api/auth/refresh`, { headers: bffHeaders(origin) });
    expect(refresh.status(), `refresh in ${app}`).toBe(200);
    response = await context.request.post(`${origin}/api/auth/realtime-token`, {
      headers: bffHeaders(origin),
    });
  }
  expect(response.status(), `realtime token in ${app}`).toBe(200);
  return ((await response.json()) as { data: { token: string } }).data.token;
}
