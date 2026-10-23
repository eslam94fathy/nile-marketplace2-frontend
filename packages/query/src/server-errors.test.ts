import { ApiError } from '@nile/api';
import { describe, expect, it, vi } from 'vitest';
import { applyServerErrors, errorMessage } from './server-errors';

const validation = (...fields: string[]) =>
  new ApiError(
    400,
    'VALIDATION_FAILED',
    'invalid',
    fields.map((field) => ({ field, constraint: 'x', message: 'backend text' })),
  );

describe('applyServerErrors', () => {
  const fieldMap = {
    email: { field: 'email', message: 'Enter a valid email address.' },
    phone: { field: 'phone', message: 'Enter a mobile number.' },
  } as const;

  it('puts each detail on its field with the field’s own message, never the backend text', () => {
    const setError = vi.fn();
    expect(applyServerErrors(validation('email', 'phone'), setError, fieldMap)).toBe(true);
    expect(setError.mock.calls).toEqual([
      ['email', { type: 'server', message: 'Enter a valid email address.' }],
      ['phone', { type: 'server', message: 'Enter a mobile number.' }],
    ]);
  });

  it('reports unmapped details so the screen adds a form alert', () => {
    const setError = vi.fn();
    expect(applyServerErrors(validation('email', 'constructor', 'other'), setError, fieldMap)).toBe(false);
    expect(setError).toHaveBeenCalledTimes(1);
  });

  it('ignores other errors', () => {
    const setError = vi.fn();
    expect(applyServerErrors(new ApiError(401, 'INVALID_CREDENTIALS', 'x'), setError, fieldMap)).toBe(false);
    expect(applyServerErrors(new Error('x'), setError, fieldMap)).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });
});

describe('errorMessage', () => {
  it('prefers the screen override, then rate limit seconds, then the default', () => {
    const invalid = new ApiError(401, 'INVALID_CREDENTIALS', 'backend text');
    expect(errorMessage(invalid, { INVALID_CREDENTIALS: 'Email or password is incorrect.' })).toBe(
      'Email or password is incorrect.',
    );
    expect(errorMessage(new ApiError(429, 'RATE_LIMITED', 'x', [], null, 30))).toBe(
      'Too many attempts. Try again in 30 s.',
    );
    expect(errorMessage(invalid)).toBe('Something went wrong. Please try again.');
    expect(errorMessage(new TypeError('boom'))).toBe('Something went wrong. Please try again.');
    expect(errorMessage(invalid, { constructor: 'x' })).toBe('Something went wrong. Please try again.');
  });
});
