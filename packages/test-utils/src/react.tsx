// Render helpers for component tests (jsdom). Kept out of the main entry so node-only suites
// (contract tests, Playwright fixtures) never load React.
import { makeQueryClient } from '@nile/query';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { userEvent, type UserEvent } from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';

/**
 * The app's query client with retries off: a mocked 5xx should fail the test at once instead of
 * waiting for backoff. Everything else (stale time, dehydration) matches production.
 */
export function makeTestQueryClient(): QueryClient {
  const client = makeQueryClient();
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, retry: false } });
  return client;
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Pass one to pre-fill the cache or to inspect it after the test. */
  readonly queryClient?: QueryClient;
}

export interface RenderWithProvidersResult extends RenderResult {
  readonly queryClient: QueryClient;
  readonly user: UserEvent;
}

/** Renders `ui` inside the providers every screen has (query client); returns a `user-event` instance. */
export function renderWithProviders(
  ui: ReactElement,
  { queryClient = makeTestQueryClient(), ...options }: RenderWithProvidersOptions = {},
): RenderWithProvidersResult {
  const user = userEvent.setup();
  function Providers({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  return { ...render(ui, { wrapper: Providers, ...options }), queryClient, user };
}
