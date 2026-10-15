// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { goToKashier, isSafeCheckoutUrl, navigation } from './redirect';
import { clearPendingPaymentOrder, PENDING_PAYMENT_ORDER_KEY, readPendingPaymentOrder } from './storage';

afterEach(() => {
  vi.restoreAllMocks();
  clearPendingPaymentOrder();
});

describe('Kashier redirect (CLAUDE.md §9.4)', () => {
  it.each([
    ['https://checkout.kashier.io/s/abc', true],
    ['http://checkout.kashier.io/s/abc', false],
    ['javascript:alert(1)', false],
    ['//evil.test/x', false],
    ['not a url', false],
  ])('%s → safe %s', (url, safe) => {
    expect(isSafeCheckoutUrl(url)).toBe(safe);
  });

  it('https: stores the order id, then leaves', () => {
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    expect(goToKashier('order-1', 'https://checkout.kashier.io/s/abc')).toBe(true);
    expect(window.sessionStorage.getItem(PENDING_PAYMENT_ORDER_KEY)).toBe('order-1');
    expect(assign).toHaveBeenCalledWith('https://checkout.kashier.io/s/abc');
  });

  it('anything else: stays, stores nothing', () => {
    const assign = vi.spyOn(navigation, 'assign').mockImplementation(() => undefined);
    expect(goToKashier('order-1', 'http://checkout.kashier.io/s/abc')).toBe(false);
    expect(readPendingPaymentOrder()).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('storage that throws is survived', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readPendingPaymentOrder()).toBeNull();
  });
});
