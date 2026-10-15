// T-H6 journey (workflow AD-1, spec 03 AD-03) against the real backend: the test admin invites a new admin in
// the console, the invitee accepts (token from Mailpit), then is suspended and can no longer sign in.
import type { Schema } from '@nile/api';
import { expectData, inviteTokenFromEmail, randomPassword, uniqueEmail } from '@nile/test-utils/e2e';
import { appUrl } from '../apps';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';

test('invite → accept → suspend → sign-in refused', async ({ page, signIn, accounts, request }) => {
  test.slow();
  await signIn('admin');
  const email = uniqueEmail('admin');
  const password = randomPassword();

  await page.goto('/admins');
  await expect(page.getByRole('heading', { level: 1, name: 'Admins' })).toBeVisible();
  await expectNoBlockingA11yViolations(page);
  await page.getByRole('button', { name: 'Invite admin' }).click();
  const invite = page.getByRole('dialog', { name: 'Invite admin' });
  await invite.getByLabel(/^Email/).fill(email);
  const text = await accounts.mailpit.awaitEmail(email, 'invite', () =>
    invite.getByRole('button', { name: 'Send invitation' }).click(),
  );
  await expect(page.getByText(`Invitation sent to ${email}. It's valid for 72 hours.`)).toBeVisible();

  expectData(
    await accounts.backend.request('POST', '/api/v1/auth/invite/accept', {
      body: { token: inviteTokenFromEmail(text), password } satisfies Schema<'AcceptInviteDto'>,
    }),
    200,
  );

  await page.goto('/admins?status=active');
  const row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('button', { name: `Suspend ${email}` }).click();
  const suspend = page.getByRole('dialog', { name: 'Suspend admin' });
  await suspend.getByLabel(/^Reason/).fill('End-to-end test');
  await suspend.getByRole('button', { name: 'Suspend' }).click();
  await expect(page.getByText(`${email} was suspended.`)).toBeVisible();
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: email })
      .getByRole('button', { name: `Reactivate ${email}` }),
  ).toBeVisible();

  // The suspended admin's sign-in is refused (a separate request context: no session of the test admin).
  const origin = appUrl('admin');
  const login = await request.post(`${origin}/api/auth/login`, {
    headers: { Origin: origin, 'X-Nile-Client': '1' },
    data: { email, password },
  });
  expect(login.ok()).toBe(false);
  expect(((await login.json()) as { error: { code: string } }).error.code).toBe('ACCOUNT_SUSPENDED');
});

test('your own row has no "Suspend"', async ({ page, signIn }) => {
  const me = await signIn('admin');
  await page.goto('/admins?status=active');
  const row = page.getByRole('row').filter({ hasText: `${me.email} (you)` });
  await expect(row).toBeVisible();
  await expect(row.getByRole('button', { name: /^Suspend/ })).toHaveCount(0);
});
