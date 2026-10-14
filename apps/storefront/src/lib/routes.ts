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
/** Email carried between the sign-in screens (spec 01 SF-10…SF-14). */
export const EMAIL_PARAM = 'email';
/** Message shown on arrival (spec 01 SF-10 `notice`). */
export const NOTICE_PARAM = 'notice';
/**
 * Set by the screen that just made the backend email a code (registration, forgot password), so the next
 * screen starts the 60 s resend cooldown; removed from the address bar once read (decided 2026-10-14).
 */
export const CODE_SENT_PARAM = 'sent';
export const CODE_SENT_VALUE = '1';

/** `notice` values (spec 01 SF-10, SF-12). */
export const NOTICES = {
  passwordReset: 'password-reset',
  sessionEnded: 'session-ended',
  emailNotVerified: 'email-not-verified',
} as const;
export type Notice = (typeof NOTICES)[keyof typeof NOTICES];

/** Sign-in screens: never a `returnTo` destination. */
export const AUTH_PATHS = [
  ROUTES.login,
  ROUTES.register,
  ROUTES.verifyEmail,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
] as const;
