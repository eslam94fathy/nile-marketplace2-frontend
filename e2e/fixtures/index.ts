import AxeBuilder from '@axe-core/playwright';
import { createAccounts, type Account, type Accounts } from '@nile/test-utils/e2e';
import { test as base, expect, type Page } from '@playwright/test';
import { appUrl, type E2eAppName } from '../apps';

// Per-role fixtures (design 01 §12.3): each test that asks for a role gets a fresh account made through the
// backend (Mailpit for codes and invites); the seeded admin is signed in once per worker. `signIn(app)` gives
// the test's browser a real session in that app through its BFF (one account per role and worker, a fresh
// sign-in per test: sharing session cookies between tests would replay rotated refresh tokens).

/** How Chromium reports a blocked (or report-only) resource in the console. */
const CSP_VIOLATION = /Content Security Policy/i;

interface RoleFixtures {
  /** Signs the test's browser context in to `app` with an account of that app's role. */
  readonly signIn: (app: E2eAppName) => Promise<Account>;
  readonly customer: Account;
  readonly seller: Account & { readonly sellerId: string };
  readonly agent: Account & { readonly agentId: string };
  /** Automatic (T-I1): fails the test when the browser reports a CSP violation on any of our pages. */
  readonly cspGuard: undefined;
}

interface WorkerFixtures {
  readonly accounts: Accounts;
  readonly admin: Account;
  /** One account per app's role, created on first use and reused by the worker's tests. */
  readonly accountFor: (app: E2eAppName) => Promise<Account>;
}

export const test = base.extend<RoleFixtures, WorkerFixtures>({
  cspGuard: [
    async ({ page }, provide) => {
      const violations: string[] = [];
      page.on('console', (message) => {
        if (CSP_VIOLATION.test(message.text())) violations.push(`${page.url()}: ${message.text()}`);
      });
      await provide(undefined);
      expect(violations, 'Content Security Policy violations').toEqual([]);
    },
    { auto: true },
  ],
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
  accountFor: [
    async ({ accounts }, provide) => {
      const cache = new Map<E2eAppName, Promise<Account>>();
      const create = (app: E2eAppName): Promise<Account> => {
        switch (app) {
          case 'storefront':
            return accounts.customer();
          case 'seller':
            return accounts.seller({ approved: true });
          case 'admin':
            return accounts.admin();
          case 'agent':
            return accounts.agent();
        }
      };
      await provide((app) => {
        const cached = cache.get(app) ?? create(app);
        cache.set(app, cached);
        return cached;
      });
    },
    { scope: 'worker' },
  ],
  signIn: async ({ context, accountFor }, provide) => {
    await provide(async (app) => {
      const account = await accountFor(app);
      const origin = appUrl(app);
      const response = await context.request.post(`${origin}/api/auth/login`, {
        headers: { Origin: origin, 'X-Nile-Client': '1' },
        data: { email: account.email, password: account.password },
      });
      expect(response.status(), `sign-in to ${app}`).toBe(200);
      return account;
    });
  },
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
    .map((violation) => {
      const targets = violation.nodes.map((node) => node.target.join(' ')).join(', ');
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help} at ${targets}`;
    });
  expect(blocking, 'serious or critical accessibility violations').toEqual([]);
}
