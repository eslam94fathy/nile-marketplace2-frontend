import { ApiError } from '@nile/api';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GC_TIME_MS,
  DEFAULT_STALE_TIME_MS,
  getQueryClient,
  makeQueryClient,
  shouldRetryQuery,
} from './query-client';

describe('shouldRetryQuery', () => {
  it.each([
    ['a network failure', new ApiError(0, 'NETWORK_ERROR', 'x'), true],
    ['a BFF upstream timeout', new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'), true],
    ['a 500', new ApiError(500, 'INTERNAL_ERROR', 'x'), true],
    ['a 503', new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'), true],
    ['a 404', new ApiError(404, 'PRODUCT_NOT_FOUND', 'x'), false],
    ['a 401', new ApiError(401, 'UNAUTHENTICATED', 'x'), false],
    ['a 429', new ApiError(429, 'RATE_LIMITED', 'x'), false],
    ['a plain Error (a bug)', new Error('x'), false],
  ])('first failure: %s → retry %s', (_label, error, expected) => {
    expect(shouldRetryQuery(0, error)).toBe(expected);
  });

  it('stops after two retries', () => {
    const error = new ApiError(0, 'NETWORK_ERROR', 'x');
    expect(shouldRetryQuery(1, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(false);
  });
});

describe('makeQueryClient', () => {
  it('applies the design defaults', () => {
    const { queries, mutations } = makeQueryClient().getDefaultOptions();
    expect(queries?.staleTime).toBe(DEFAULT_STALE_TIME_MS);
    expect(queries?.gcTime).toBe(DEFAULT_GC_TIME_MS);
    expect(queries?.refetchOnWindowFocus).toBe(true);
    expect(queries?.retry).toBe(shouldRetryQuery);
    expect(mutations?.retry).toBe(false);
  });
});

describe('getQueryClient on the server (node environment)', () => {
  it('never hands out a shared module-level client across requests', () => {
    // Outside a React Server Component request, `cache` does not memoise: each call is a new client.
    expect(getQueryClient()).not.toBe(getQueryClient());
  });
});
