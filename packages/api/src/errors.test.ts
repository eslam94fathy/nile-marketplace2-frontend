import { describe, expect, it } from 'vitest';
import { BACKEND_ERROR_CODES, CLIENT_ERROR_CODES, ERROR_CODES, isKnownErrorCode } from './error-codes';
import { ApiError, isApiError, parseRetryAfter } from './errors';

describe('parseRetryAfter', () => {
  const now = Date.parse('2026-10-14T10:00:00Z');

  it.each([
    ['30', 30],
    [' 5 ', 5],
    ['0', 0],
    ['Wed, 14 Oct 2026 10:01:30 GMT', 90],
    ['Wed, 14 Oct 2026 09:00:00 GMT', 0],
    [null, null],
    ['', null],
    ['soon', null],
    ['-5', null],
  ])('%j → %j', (value, expected) => {
    expect(parseRetryAfter(value, now)).toBe(expected);
  });
});

describe('isApiError', () => {
  const error = new ApiError(409, 'SKU_TAKEN', 'taken');

  it('matches any ApiError without codes, or the listed codes', () => {
    expect(isApiError(error)).toBe(true);
    expect(isApiError(error, 'SKU_TAKEN', 'CONFLICT')).toBe(true);
    expect(isApiError(error, 'CONFLICT')).toBe(false);
    expect(isApiError(new Error('x'))).toBe(false);
  });

  it('keeps unknown future codes as strings', () => {
    const future = new ApiError(400, 'SOMETHING_NEW', 'x');
    expect(future.code).toBe('SOMETHING_NEW');
    expect(isKnownErrorCode(future.code)).toBe(false);
  });
});

describe('error code catalogue', () => {
  it('has no duplicates and only UPPER_SNAKE_CASE codes', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
    for (const code of ERROR_CODES) expect(code).toMatch(/^[A-Z][A-Z0-9_]+$/);
  });

  it('keeps client-only codes apart from backend codes', () => {
    const backend = new Set<string>(BACKEND_ERROR_CODES);
    for (const code of CLIENT_ERROR_CODES) expect(backend.has(code)).toBe(false);
    expect(BACKEND_ERROR_CODES).toHaveLength(171);
  });
});
