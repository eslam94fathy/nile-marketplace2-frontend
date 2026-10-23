import { ApiError } from '@nile/api';
import { defaultShouldDehydrateQuery, environmentManager, QueryClient } from '@tanstack/react-query';
import { cache } from 'react';

// Defaults from design 01 §6 (CLAUDE.md §5).
export const DEFAULT_STALE_TIME_MS = 30_000;
export const DEFAULT_GC_TIME_MS = 5 * 60_000;
/** Retries after the first failure, for transient failures only. */
export const MAX_QUERY_RETRIES = 2;

const TRANSIENT_CODES = new Set(['NETWORK_ERROR', 'UPSTREAM_TIMEOUT']);

/**
 * Queries retry only transient failures (no response, BFF timeout, 5xx); every 4xx is an answer, not a
 * hiccup. Errors that aren't ApiError are bugs and never retried.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES || !(error instanceof ApiError)) return false;
  return TRANSIENT_CODES.has(error.code) || error.status >= 500;
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_STALE_TIME_MS,
        gcTime: DEFAULT_GC_TIME_MS,
        retry: shouldRetryQuery,
        refetchOnWindowFocus: true,
      },
      // Mutations never auto-retry; idempotent ones are re-sent explicitly with the same key (design 01 §6.1).
      mutations: { retry: false },
      dehydrate: {
        // Also send queries still pending on the server, so streamed RSC prefetches reach the client.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}

/** One client per server request (React `cache` is scoped to a request in Server Components). */
const getServerQueryClient = cache(makeQueryClient);

let browserQueryClient: QueryClient | undefined;

/**
 * Server: a new client per request, never shared between users (no module-level server client).
 * Browser: one client for the page's lifetime, so suspense and re-renders don't drop the cache.
 */
export function getQueryClient(): QueryClient {
  if (environmentManager.isServer()) return getServerQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
