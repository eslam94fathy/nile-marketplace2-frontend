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
  /** Account menu page for phones (SF-Q-13, T-K6b). */
  accountMenu: '/account/menu',
  addresses: '/account/addresses',
  orders: '/account/orders',
  security: '/account/security',
  /** SF-32 / SF-33 (spec 01 §10.2, SF-Q-20). */
  notifications: '/account/notifications',
  notificationSettings: '/account/notifications/settings',
  /** SF-24 My reviews (T-K5); `?review=` highlights one. */
  reviews: '/account/reviews',
  /** SF-23 Wishlist (T-K3). */
  wishlist: '/account/wishlist',
  /** SF-27 Returns (T-K6), `?status=open|closed`. */
  returns: '/account/returns',
  /** SF-29 Support tickets (T-K7). */
  support: '/account/support',
} as const;

/** SF-05 Product page (the route accepts an id or a slug; lists link by slug). */
export function productPath(slug: string): `/p/${string}` {
  return `/p/${slug}`;
}

/** SF-18 Order detail. */
export const orderPath = (orderId: string) => `${ROUTES.orders}/${orderId}` as const;

/** SF-28 Return (T-K6). */
export const returnPath = (returnId: string) => `${ROUTES.returns}/${returnId}` as const;

/** SF-26 Request a return for one parcel (spec 01 §10.2). */
export const requestReturnPath = (orderId: string, sellerOrderId: string) =>
  `${ROUTES.orders}/${orderId}/return?sellerOrder=${sellerOrderId}` as const;

/** SF-24 scrolled to one review (spec 01 §10, `?review=<id>` from a notification). */
export const reviewPath = (reviewId: string) => `${ROUTES.reviews}?review=${reviewId}` as const;

/** SF-31 Support ticket (T-K7). */
export const supportTicketPath = (ticketId: string) => `${ROUTES.support}/${ticketId}` as const;

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
