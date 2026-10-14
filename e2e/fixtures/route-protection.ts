import { appUrl, type E2eAppName } from '../apps';
import { expect, test } from './index';

// T-D3 acceptance per app: a deep link while signed out goes to sign-in with returnTo, and after signing in
// the user lands back on it; returnTo never leads off the site. Sign-in goes through the BFF until the
// sign-in screens exist (T-D4…T-D6); proxy.ts then sends the signed-in user from /login to returnTo.

export interface DeepLink {
  /** A protected page with a query, e.g. `/orders?tab=new`. */
  readonly path: string;
  /** Its page heading. */
  readonly heading: string;
  /** The role's landing heading. */
  readonly home: string;
}

export function routeProtectionTests(app: E2eAppName, deepLink: DeepLink): void {
  const origin = appUrl(app);
  const loginUrl = `/login?returnTo=${encodeURIComponent(deepLink.path)}`;

  test('a deep link while signed out → sign-in → back to the deep link', async ({ page, signIn }) => {
    await page.goto(deepLink.path);
    await expect(page).toHaveURL(`${origin}${loginUrl}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();

    await signIn(app);
    await page.goto(loginUrl);
    await expect(page).toHaveURL(`${origin}${deepLink.path}`);
    await expect(page.getByRole('heading', { level: 1, name: deepLink.heading })).toBeVisible();
  });

  test('returnTo never leaves the site, and signed-in users skip the sign-in page', async ({
    page,
    signIn,
  }) => {
    await signIn(app);
    for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example']) {
      await page.goto(`/login?returnTo=${encodeURIComponent(unsafe)}`);
      await expect(page, unsafe).toHaveURL(`${origin}/`);
    }
    await expect(page.getByRole('heading', { level: 1, name: deepLink.home })).toBeVisible();
  });
}
