/** Storefront routes (spec 01 §2.4). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  home: '/',
  search: '/search',
  cart: '/cart',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  account: '/account',
  addresses: '/account/addresses',
  orders: '/account/orders',
  security: '/account/security',
} as const;

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
] as const;
