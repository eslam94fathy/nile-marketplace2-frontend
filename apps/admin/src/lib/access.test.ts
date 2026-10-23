import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './access';

describe('isProtectedPath', () => {
  it.each(['/', '/orders', '/security'])('%s needs a session', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each([
    '/login',
    '/forgot-password',
    '/reset-password',
    '/login/x',
    '/forgot-password/x',
    '/reset-password/x',
  ])('%s is public', (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});
