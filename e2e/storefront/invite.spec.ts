// T-D6 journeys against the real backend: an admin invites an admin and a delivery agent (through the API;
// the invite screens arrive in phase h), the invitee opens the emailed token on the storefront's neutral
// landing page, sets a password, is sent to their own app's sign-in page and signs in there. The storefront
// never keeps a session for them.
import { inviteTokenFromEmail, randomPassword, randomPhone, uniqueEmail } from '@nile/test-utils/e2e';
import type { Page } from '@playwright/test';
import { E2E_APPS } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

/** The storefront session cookie, with or without the `__Host-` prefix. */
const STOREFRONT_SESSION_COOKIE = 'nile_storefront_session';

async function acceptOnLanding(page: Page, token: string, password: string): Promise<void> {
  await page.goto(`/invite?token=${token}`);
  await expect(page).toHaveURL(/\/invite$/); // the token is gone from the address bar
  await expectNoBlockingA11yViolations(page);
  await page.getByLabel(/^New password/).fill(password);
  await page.getByLabel(/^Confirm new password/).fill(password);
  await page.getByRole('button', { name: 'Set password' }).click();
}

async function signInOnOwnApp(page: Page, password: string, landing: string): Promise<void> {
  await expect(page).toHaveURL(/\/login\?notice=invited&email=/);
  await expect(page.getByRole('status')).toHaveText('Your password is set. Please sign in.');
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: landing })).toBeVisible();
}

test('an invited admin sets a password on the storefront and signs in to the admin app', async ({
  page,
  context,
  accounts,
  admin,
}) => {
  const email = uniqueEmail('invited-admin');
  const password = randomPassword();
  const text = await accounts.mailpit.awaitEmail(email, 'invite', async () => {
    const response = await accounts.backend.request('POST', '/api/v1/admin/admins', {
      token: admin.accessToken,
      body: { email },
    });
    expect(response.status).toBe(201);
  });

  await acceptOnLanding(page, inviteTokenFromEmail(text), password);
  await signInOnOwnApp(page, password, E2E_APPS.admin.landing);
  // Cookies aren't port-scoped on localhost: no storefront session may exist in this browser at all.
  const cookies = await context.cookies();
  expect(cookies.some((cookie) => cookie.name.includes(STOREFRONT_SESSION_COOKIE))).toBe(false);
});

test('an invited delivery agent sets a password and signs in to the agent app', async ({
  page,
  accounts,
  admin,
}) => {
  const email = uniqueEmail('invited-agent');
  const password = randomPassword();
  const governorates = await accounts.backend.request('GET', '/api/v1/governorates');
  const [first] = (governorates.body as { data: { id: string }[] }).data;
  const text = await accounts.mailpit.awaitEmail(email, 'invite', async () => {
    const response = await accounts.backend.request('POST', '/api/v1/admin/delivery-agents', {
      token: admin.accessToken,
      body: { email, fullName: 'E2E Invited Agent', phone: randomPhone(), homeGovernorateId: first?.id },
    });
    expect(response.status).toBe(201);
  });

  await acceptOnLanding(page, inviteTokenFromEmail(text), password);
  await signInOnOwnApp(page, password, E2E_APPS.agent.landing);
});

test('a used invite link asks the invitee to get a new one', async ({ page, accounts, admin }) => {
  const email = uniqueEmail('invite-twice');
  const text = await accounts.mailpit.awaitEmail(email, 'invite', async () => {
    const response = await accounts.backend.request('POST', '/api/v1/admin/admins', {
      token: admin.accessToken,
      body: { email },
    });
    expect(response.status).toBe(201);
  });
  const token = inviteTokenFromEmail(text);
  const password = randomPassword();
  await acceptOnLanding(page, token, password);
  await expect(page).toHaveURL(/\/login\?notice=invited/);

  await page.goBack();
  await acceptOnLanding(page, token, password);
  await expect(page.locator('form').getByRole('alert')).toContainText(
    'This invitation has expired or was already used. Ask an admin to send a new one.',
  );
});
