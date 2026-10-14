import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { TEST_APP_ORIGIN } from './setup';

/** The BFF proxy base, for `mockApi(…, { base: BFF_BASE })`. */
export const BFF_BASE = `${TEST_APP_ORIGIN}/api/bff`;

/** One MSW server per test file; any request without a handler fails the test (MSW 3). */
export function setupMswServer() {
  const server = setupServer();
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}
