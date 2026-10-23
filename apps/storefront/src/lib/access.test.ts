import { describe, expect, it } from 'vitest';
import { isProtectedPath } from './access';

describe('isProtectedPath', () => {
  it.each(['/cart', '/checkout/confirmation/x', '/account', '/account/orders/1'])(
    '%s needs a session',
    (path) => {
      expect(isProtectedPath(path)).toBe(true);
    },
  );

  it.each(['/', '/p/red-shirt', '/login', '/accounts', '/cartography'])('%s is public', (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});
