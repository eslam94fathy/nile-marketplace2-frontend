import { createApiClient, serverTransport } from '@nile/api';
import { TEST_API_ORIGIN } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { setupServer } from 'msw/node';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { SupportScreensProvider, type OrderChoice, type SupportScreensConfig } from '../config';

// Test harness: the screens inside a provider with the typed client against MSW and a plain-anchor Link.

export const api = createApiClient(serverTransport({ baseUrl: TEST_API_ORIGIN }));

/** The customer's categories (spec 01 SF-30: all but `seller_onboarding`). */
export const CUSTOMER_CATEGORIES = ['order', 'payment', 'delivery', 'return', 'account', 'other'] as const;

export const ROUTES: SupportScreensConfig['routes'] = {
  list: (tab) => `/support?status=${tab}`,
  newTicket: '/support/new',
  ticket: (ticketId) => `/support/${ticketId}`,
  order: (orderId) => `/orders/${orderId}`,
};

/** A fixed order list for the new-ticket form (the storefront reads `GET /orders`). */
export function orderChoicesFrom(
  choices: readonly OrderChoice[],
): NonNullable<SupportScreensConfig['orderChoices']> {
  return () => Promise.resolve(choices);
}

export function makeConfig(overrides: Partial<SupportScreensConfig> = {}): SupportScreensConfig {
  return {
    api,
    scope: 'storefront',
    categories: CUSTOMER_CATEGORIES,
    routes: ROUTES,
    navigate: vi.fn(),
    Link: ({ href, className, children, ...rest }) => (
      <a href={href} className={className} aria-current={rest['aria-current']}>
        {children}
      </a>
    ),
    ...overrides,
  };
}

export function renderSupport(ui: ReactElement, config: SupportScreensConfig = makeConfig()) {
  return renderWithProviders(<SupportScreensProvider config={config}>{ui}</SupportScreensProvider>);
}

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
