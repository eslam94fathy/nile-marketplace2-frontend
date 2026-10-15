import { savePendingPaymentOrder } from './storage';

/** CLAUDE.md §9.4: an external URL from the API is followed only when it is `https:`. */
export function isSafeCheckoutUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** Leaves for Kashier's page; a separate function so tests can replace the navigation. */
export const navigation = {
  assign: (url: string) => {
    window.location.assign(url);
  },
};

/**
 * Remembers the order for the return page, then goes to Kashier (spec 01 SF-07-A1 step 3, SF-18-A2).
 * Returns false, without leaving, when the URL is not `https:`.
 */
export function goToKashier(orderId: string, checkoutUrl: string): boolean {
  if (!isSafeCheckoutUrl(checkoutUrl)) return false;
  savePendingPaymentOrder(orderId);
  navigation.assign(checkoutUrl);
  return true;
}
