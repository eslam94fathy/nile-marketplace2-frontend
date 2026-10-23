// T-D2 acceptance against the real backend: two open tabs reach the refresh point at the same moment, the
// browser serialises the refresh, the backend rotates the token exactly once and the session survives.
// Needs a short access-token lifetime: ACCESS_TOKEN_TTL_MINUTES=2 in the backend's own .env (CI sets it in
// its throwaway stack). With the default 15 minutes the test is skipped.
import type { BrowserContext, Response } from '@playwright/test';
import { appUrl } from '../apps';
import { expect, test } from '../fixtures';

const ORIGIN = appUrl('storefront');
const SV_COOKIE = '__Host-nile_storefront_sv';
/** Longest access-token lifetime this test waits out (backend ACCESS_TOKEN_TTL_MINUTES=2). */
const MAX_TTL_MS = 3 * 60_000;
/** Time left after the first rotation for a second, unwanted one to show up. */
const QUIET_PERIOD_MS = 10_000;

async function sessionVersion(context: BrowserContext): Promise<number | null> {
  const cookie = (await context.cookies(ORIGIN)).find((c) => c.name === SV_COOKIE);
  return cookie === undefined ? null : Number(cookie.value);
}

test('two tabs refreshing at the same time rotate the token once and stay signed in', async ({
  context,
  customer,
}) => {
  test.setTimeout(MAX_TTL_MS + 60_000);

  const login = await context.request.post(`${ORIGIN}/api/auth/login`, {
    headers: { Origin: ORIGIN, 'X-Nile-Client': '1' },
    data: { email: customer.email, password: customer.password },
  });
  expect(login.status()).toBe(200);
  expect(await login.text()).not.toContain(customer.accessToken);

  const firstVersion = await sessionVersion(context);
  expect(firstVersion).not.toBeNull();
  const ttl = (firstVersion ?? 0) - Date.now();
  test.skip(
    ttl > MAX_TTL_MS,
    `access token lives ${Math.round(ttl / 60_000)} min; set ACCESS_TOKEN_TTL_MINUTES=2 in the backend`,
  );

  // A rotation is a refresh answer that writes new cookies; "still fresh" answers write none.
  let rotations = 0;
  let refreshCalls = 0;
  context.on('response', (response: Response) => {
    if (!response.url().endsWith('/api/auth/refresh')) return;
    refreshCalls += 1;
    void response.allHeaders().then((headers) => {
      if (headers['set-cookie'] !== undefined) rotations += 1;
    });
  });

  const tabs = [await context.newPage(), await context.newPage()];
  for (const tab of tabs) await tab.goto('/');

  await expect
    .poll(() => sessionVersion(context), { timeout: MAX_TTL_MS, intervals: [2_000] })
    .not.toBe(firstVersion);
  await tabs[0]?.waitForTimeout(QUIET_PERIOD_MS);

  expect(rotations).toBe(1);
  expect(refreshCalls).toBeGreaterThanOrEqual(1);
  // Reuse of a rotated token would have revoked the whole session; it still works.
  const me = await context.request.get(`${ORIGIN}/api/bff/me`);
  expect(me.status()).toBe(200);
});
