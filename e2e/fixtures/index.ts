import AxeBuilder from '@axe-core/playwright';
import { createAccounts, type Account, type Accounts } from '@nile/test-utils/e2e';
import { test as base, expect, type Page } from '@playwright/test';

// Per-role fixtures (design 01 §12.3): each test that asks for a role gets a fresh account made through the
// backend (Mailpit for codes and invites); the seeded admin is signed in once per worker. Browser sign-in
// fixtures (a page with a session) arrive with the BFF login in phase d.

interface RoleFixtures {
  readonly customer: Account;
  readonly seller: Account & { readonly sellerId: string };
  readonly agent: Account & { readonly agentId: string };
}

interface WorkerFixtures {
  readonly accounts: Accounts;
  readonly admin: Account;
}

export const test = base.extend<RoleFixtures, WorkerFixtures>({
  accounts: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads fixture dependencies from this pattern
    async ({}, provide) => {
      await provide(createAccounts());
    },
    { scope: 'worker' },
  ],
  admin: [
    async ({ accounts }, provide) => {
      await provide(await accounts.admin());
    },
    { scope: 'worker' },
  ],
  customer: async ({ accounts }, provide) => {
    await provide(await accounts.customer());
  },
  seller: async ({ accounts }, provide) => {
    await provide(await accounts.seller({ approved: true }));
  },
  agent: async ({ accounts }, provide) => {
    await provide(await accounts.agent());
  },
});

export { expect };

/** Impacts that fail a test (CLAUDE.md §7: zero serious/critical axe violations). */
const BLOCKING_IMPACTS = new Set(['serious', 'critical']);

/** Runs axe (WCAG 2.2 AA rules) on the current page and fails on serious or critical violations. */
export async function expectNoBlockingA11yViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations
    .filter((violation) => BLOCKING_IMPACTS.has(violation.impact ?? ''))
    .map((violation) => `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}`);
  expect(blocking, 'serious or critical accessibility violations').toEqual([]);
}
