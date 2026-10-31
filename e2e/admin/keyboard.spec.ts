// T-I2 keyboard-only walkthrough of the admin workflows (AD-2 sellers, AD-4 delivery setup, AD-5 agents)
// against the real backend: sign in, approve a seller and set their commission, set a delivery fee, create
// a delivery agent. The pending seller is registered through the API.
import { randomUUID } from 'node:crypto';
import { expect, expectNoBlockingA11yViolations, test } from '../fixtures';
import { choose, press, tabTo, type } from '../fixtures/keyboard';
import { openTicket } from '../fixtures/returns';

test('admin journey by keyboard only', async ({ page, accounts, admin }) => {
  test.slow();
  const seller = await accounts.seller({ approved: false });

  // Sign in.
  await page.goto('/login');
  await type(page, page.getByLabel(/^Email/), admin.email);
  await type(page, page.getByLabel(/^Password/), admin.password);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();

  // AD-2 approve, then a commission rate.
  await page.goto(`/sellers/${seller.sellerId}`);
  await press(page, page.getByRole('button', { name: 'Approve' }));
  const approve = page.getByRole('dialog', { name: 'Approve' });
  await expect(approve).toBeVisible();
  await press(page, approve.getByRole('button', { name: 'Approve' }));
  await expect(page.getByRole('button', { name: 'Suspend' })).toBeVisible();
  await type(page, page.getByLabel(/^Commission rate/), '12.5');
  await press(page, page.getByRole('button', { name: 'Save rate' }));
  await expect(page.getByRole('table', { name: 'Commission changes, newest first' })).toContainText('12.5%');

  // AD-4 a delivery fee.
  await page.goto('/delivery/settings');
  await press(page, page.getByRole('button', { name: 'Set fee for Cairo' }));
  const fee = page.getByRole('dialog', { name: 'Delivery fee for Cairo' });
  await expect(fee).toBeVisible();
  await type(page, fee.getByLabel(/^Delivery fee/), '45');
  await press(page, fee.getByRole('button', { name: 'Save fee' }));
  await expect(page.getByText(/^Cairo: delivery fee /)).toBeVisible();

  // AD-5 a new agent (the governorate chosen from a Select by keyboard).
  const suffix = randomUUID().slice(0, 8);
  await page.goto('/delivery/agents/new');
  await type(page, page.getByLabel(/^Email/), `e2e-kb-agent-${suffix}@example.test`);
  await type(page, page.getByLabel(/^Full name/), `Keyboard Agent ${suffix}`);
  await type(page, page.getByLabel(/^Mobile number/), `011${String(Date.now()).slice(-8)}`);
  await choose(page, page.getByRole('combobox', { name: /^Home governorate/ }), 'Cairo');
  await press(page, page.getByRole('button', { name: 'Create agent and send invitation' }));
  await expect(page.getByRole('heading', { level: 1, name: `Keyboard Agent ${suffix}` })).toBeVisible();
});

// T-O2: the support console by keyboard only (AD-29): a reply, then the Internal note tab by arrows and a note.
// The customer's ticket is opened through the API.
test('support reply and internal note by keyboard only', async ({ page, signIn, accounts, customer }) => {
  await signIn('admin');
  const ticket = await openTicket(
    accounts.backend,
    customer.accessToken,
    `Keyboard ${randomUUID().slice(0, 8)}`,
  );

  await page.goto(`/support/${ticket.id}`);
  const messages = page.getByRole('region', { name: 'Messages' });
  await type(page, page.getByRole('textbox', { name: /^Reply to the user/ }), 'Looking into it');
  await press(page, page.getByRole('button', { name: 'Send' }));
  await expect(messages.getByText('Looking into it')).toBeVisible();

  // Tabs: only the selected tab is in the tab order; the arrow moves to the other one and selects it.
  await tabTo(page, page.getByRole('tab', { name: 'Reply' }));
  await page.keyboard.press('ArrowRight');
  const note = page.getByRole('tab', { name: 'Internal note' });
  await expect(note).toBeFocused();
  await expect(note).toHaveAttribute('aria-selected', 'true');
  await type(page, page.getByRole('textbox', { name: /^Internal note/ }), 'Check the courier log');
  await press(page, page.getByRole('button', { name: 'Add note' }));
  await expect(messages.getByText('Check the courier log')).toBeVisible();
  await expectNoBlockingA11yViolations(page);
});
