// T-I3 Lighthouse CI run (budgets in lighthouserc.cjs) against the storefront's production build and the
// real backend: home, the first category's listing and the first in-stock product signed out (the pages
// search engines and new visitors get), then the cart signed in with one item in it.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import type { Schema } from '@nile/api';
import { expectData } from '@nile/test-utils/e2e';
import { chromium } from '@playwright/test';
import { appUrl } from '../apps';
import { expect, test } from '../fixtures';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const LHCI = join(dirname(require.resolve('@lhci/cli/package.json')), 'src', 'cli.js');
const CONFIG = join(import.meta.dirname, 'lighthouserc.cjs');
const ORIGIN = appUrl('storefront');
/** 4 URLs × 3 runs on a throttled profile take a few minutes. */
const PERF_TIMEOUT_MS = 20 * 60_000;
const SESSION_COOKIES = ['__Host-nile_storefront_session', '__Host-nile_storefront_sv'];

/** Runs the Lighthouse CI CLI with Node (no shell); its output is returned for the report. */
async function lhci(args: readonly string[]): Promise<string> {
  const { stdout, stderr } = await run(process.execPath, [LHCI, ...args], {
    env: { ...process.env, CHROME_PATH: chromium.executablePath() },
    maxBuffer: 32 * 1024 * 1024,
  }).catch((error: unknown) => {
    const failure = error as { stdout?: string; stderr?: string; message?: string };
    throw new Error(
      `lhci ${args[0] ?? ''} failed:\n${failure.stdout ?? ''}\n${failure.stderr ?? failure.message ?? ''}`,
    );
  });
  return `${stdout}${stderr}`;
}

test('storefront Web Vitals budgets (Lighthouse CI)', async ({
  accounts,
  customer,
  playwright,
}, testInfo) => {
  test.setTimeout(PERF_TIMEOUT_MS);
  const { backend } = accounts;

  const tree = expectData(
    await backend.request('GET', '/api/v1/categories'),
    200,
  ) as Schema<'CategoryNodeDto'>[];
  const category = tree[0];
  const [product] = expectData(
    await backend.request('GET', '/api/v1/products?limit=1&inStock[eq]=true'),
    200,
  ) as Schema<'ProductListItemDto'>[];
  if (category === undefined || product === undefined) {
    throw new Error('No catalog: run the backend seed (npm run seed:dev)');
  }
  const detail = expectData(
    await backend.request('GET', `/api/v1/products/${product.slug}`),
    200,
  ) as Schema<'ProductDetailDto'>;
  const variant = detail.variants.find((item) => item.inStock);
  expectData(
    await backend.request('POST', '/api/v1/cart/items', {
      token: customer.accessToken,
      body: { variantId: variant?.id ?? '', quantity: 1 },
    }),
    201,
  );

  // The cart's session: a real sign-in through the storefront's own auth route.
  const browserless = await playwright.request.newContext();
  const login = await browserless.post(`${ORIGIN}/api/auth/login`, {
    headers: { Origin: ORIGIN, 'X-Nile-Client': '1' },
    data: { email: customer.email, password: customer.password },
  });
  expect(login.status()).toBe(200);
  const cookie = (await browserless.storageState()).cookies
    .filter((item) => SESSION_COOKIES.includes(item.name))
    .map((item) => `${item.name}=${item.value}`)
    .join('; ');
  await browserless.dispose();

  const output = [
    await lhci([
      'collect',
      `--config=${CONFIG}`,
      `--url=${ORIGIN}/`,
      `--url=${ORIGIN}/c/${category.slug}`,
      `--url=${ORIGIN}/p/${product.slug}`,
    ]),
    await lhci([
      'collect',
      `--config=${CONFIG}`,
      '--additive',
      `--url=${ORIGIN}/cart`,
      `--settings.extraHeaders=${JSON.stringify({ Cookie: cookie })}`,
    ]),
    await lhci(['upload', `--config=${CONFIG}`]),
  ];
  // Assertions last, so the reports are written even when a budget fails.
  let budgetsMet = true;
  const assertion = await lhci(['assert', `--config=${CONFIG}`]).catch((error: unknown) => {
    budgetsMet = false;
    return error instanceof Error ? error.message : String(error);
  });
  await testInfo.attach('lighthouse-ci', {
    body: [...output, assertion].join('\n'),
    contentType: 'text/plain',
  });
  expect(budgetsMet, assertion).toBe(true);
});
