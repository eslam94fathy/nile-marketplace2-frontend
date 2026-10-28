/** Delivery agent routes (spec 04 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  shipments: '/',
  history: '/history',
  finance: '/finance',
  me: '/me',
  security: '/security',
  /** AG-09 / AG-10 (spec 04 §7.2). */
  notifications: '/notifications',
  notificationSettings: '/notifications/settings',
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

/** Sign-in screens: never a `returnTo` destination. */
export const AUTH_PATHS = [ROUTES.login, ROUTES.forgotPassword, ROUTES.resetPassword] as const;

/** AG-05 Shipment. */
export const shipmentPath = (shipmentId: string) => `/shipments/${shipmentId}` as const;
