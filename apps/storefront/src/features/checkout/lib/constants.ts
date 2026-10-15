/**
 * Card payment window shown in the Kashier option (spec 01 SF-Q-5): kept equal to the backend's
 * `KASHIER_PAYMENT_TTL_MINUTES` by convention; the real deadline always comes from `paymentExpiresAt`.
 */
export const KASHIER_PAYMENT_WINDOW_MINUTES = 15;

/** SF-08 route for an order placed with cash on delivery. */
export const confirmationPath = (orderId: string) => `/checkout/confirmation/${orderId}` as const;
