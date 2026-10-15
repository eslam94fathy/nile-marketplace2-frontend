/** Storefront routes (spec 01 §2.4). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  home: '/',
  search: '/search',
  cart: '/cart',
  checkout: '/checkout',
  /** SF-09, the backend's `KASHIER_REDIRECT_URL` (OQ-2). */
  paymentReturn: '/checkout/payment-return',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  /** Invite landing for admins and agents (spec 01 SF-20); the backend's `INVITE_URL_BASE`. */
  invite: '/invite',
  account: '/account',
  addresses: '/account/addresses',
  orders: '/account/orders',
  security: '/account/security',
} as const;

/** SF-18 Order detail. */
export const orderPath = (orderId: string) => `${ROUTES.orders}/${orderId}` as const;

/** Query parameter that carries the page to return to after sign-in (conventions §2). */
export const RETURN_TO_PARAM = 'returnTo';
/** Search text parameter (spec 01 SF-03). */
export const SEARCH_PARAM = 'q';

/** Sign-in screens: never a `returnTo` destination. */
export const AUTH_PATHS = [
  ROUTES.login,
  ROUTES.register,
  ROUTES.verifyEmail,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
  ROUTES.invite,
] as const;
