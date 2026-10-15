/** Delivery agent routes (spec 04 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  shipments: '/',
  history: '/history',
  finance: '/finance',
  me: '/me',
  security: '/security',
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

/** Sign-in screens: never a `returnTo` destination. */
export const AUTH_PATHS = [ROUTES.login, ROUTES.forgotPassword, ROUTES.resetPassword] as const;
