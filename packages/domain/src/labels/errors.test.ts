import { describe, expect, it } from 'vitest';
import { defaultErrorMessage, GENERIC_ERROR_MESSAGE, rateLimitedMessage } from './errors';

describe('default error messages (conventions §4)', () => {
  it.each([
    ['VALIDATION_FAILED', 'Some fields need attention.'],
    ['FORBIDDEN', "You don't have access to this."],
    ['CONFLICT', 'This was changed by someone else. Please try again.'],
    ['ORDER_INVALID_STATUS_TRANSITION', "This was already updated. We've refreshed the page."],
    ['SELLER_ORDER_NOT_CANCELLABLE', "This was already updated. We've refreshed the page."],
    ['CART_ITEM_NOT_FOUND', 'This item no longer exists.'],
    ['INTERNAL_ERROR', GENERIC_ERROR_MESSAGE],
    ['NETWORK_ERROR', GENERIC_ERROR_MESSAGE],
    ['SOMETHING_NEW', GENERIC_ERROR_MESSAGE],
  ])('%s', (code, message) => {
    expect(defaultErrorMessage(code)).toBe(message);
  });

  it('words the rate limit with the seconds left', () => {
    expect(rateLimitedMessage(42)).toBe('Too many attempts. Try again in 42 s.');
  });
});
