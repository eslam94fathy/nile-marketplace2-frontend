// The order waiting for card payment, kept across the Kashier round trip (spec 01 SF-07-A1, SF-09).
// sessionStorage: per tab, gone when the tab closes. Storage can be unavailable (private mode, blocked
// site data), so every access is guarded and the return page falls back to the newest open order.

export const PENDING_PAYMENT_ORDER_KEY = 'nile.pendingPaymentOrderId';

export function savePendingPaymentOrder(orderId: string): void {
  try {
    window.sessionStorage.setItem(PENDING_PAYMENT_ORDER_KEY, orderId);
  } catch {
    // Without storage the return page finds the order through GET /orders.
  }
}

export function readPendingPaymentOrder(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_PAYMENT_ORDER_KEY);
  } catch {
    return null;
  }
}

export function clearPendingPaymentOrder(): void {
  try {
    window.sessionStorage.removeItem(PENDING_PAYMENT_ORDER_KEY);
  } catch {
    // Nothing stored that could be read either.
  }
}
