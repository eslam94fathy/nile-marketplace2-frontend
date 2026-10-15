import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';

// Card payments in E2E (T-F4): the backend runs with PAYMENT_GATEWAY=fake, whose checkout links point to
// https://fake-kashier.invalid (never resolves). Tests intercept that page and send the payment's webhook
// with the backend's own script, signed exactly like Kashier's (backend `npm run dev:kashier-webhook`).
// The script needs the backend checkout: NILE_BACKEND_DIR (e.g. ../nile-marketplace2), built (`dist/`).

const run = promisify(execFile);

/** Where the fake gateway sends the shopper (backend `FAKE_CHECKOUT_BASE_URL`). */
export const FAKE_KASHIER_ORIGIN = 'https://fake-kashier.invalid';

/** The backend checkout used to send signed webhooks, or null when the environment doesn't name one. */
export function backendDir(): string | null {
  const dir = process.env.NILE_BACKEND_DIR;
  return dir === undefined || dir === '' ? null : dir;
}

/** Sends Kashier's "pay" webhook for the order's payment (runs the backend's script with its `.env`). */
export async function sendKashierWebhook(
  dir: string,
  orderId: string,
  outcome: 'paid' | 'failed',
): Promise<void> {
  await run(
    process.execPath,
    ['--env-file=.env', join('scripts', 'dev-kashier-webhook.js'), orderId, outcome],
    { cwd: dir },
  );
}
