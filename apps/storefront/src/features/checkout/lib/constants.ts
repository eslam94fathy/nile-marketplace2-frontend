/**
 * Card payment window shown in the Kashier option (spec 01 SF-Q-5): kept equal to the backend's
 * `KASHIER_PAYMENT_TTL_MINUTES` by convention; the real deadline always comes from `paymentExpiresAt`.
 */
export const KASHIER_PAYMENT_WINDOW_MINUTES = 15;

/** SF-08 route for an order placed with cash on delivery. */
export const confirmationPath = (orderId: string) => `/checkout/confirmation/${orderId}` as const;

/** SF-09 (spec 01 v1.2, RT-4): the order is polled every 5 s while the tab is visible, as the socket's fallback. */
export const PAYMENT_RETURN_POLL_MS = 5_000;

/** SF-09: with a socket, `payment.updated` is awaited this long before the 5 s polling starts. */
export const PAYMENT_RETURN_SOCKET_WAIT_MS = 30_000;

/** SF-09: still awaiting payment this long after `paymentExpiresAt` → stop polling, send to the order page. */
export const PAYMENT_CONFIRMATION_GRACE_MS = 2 * 60_000;

/** SF-09 fallback without a stored id: the newest open order counts only if created within this time. */
export const PAYMENT_RETURN_ORDER_MAX_AGE_MS = 60 * 60_000;
