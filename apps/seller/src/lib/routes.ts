/** Seller portal routes (spec 02 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  overview: '/',
  orders: '/orders',
  /** SE-18 Returns (T-L3). */
  returns: '/returns',
  products: '/products',
  newProduct: '/products/new',
  finance: '/finance',
  profile: '/profile',
  security: '/security',
  /** SE-27 / SE-28 (spec 02 §8.2). */
  notifications: '/notifications',
  notificationSettings: '/notifications/settings',
  /** SE-20 Reviews (T-L4). */
  reviews: '/reviews',
  /** SE-25 New ticket (T-L6); `?category=&product=` from a blocked product (SE-Q-14). */
  supportNew: '/support/new',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

/** SE-19 Return (T-L3). */
export const returnPath = (returnId: string) => `/returns/${returnId}` as const;

/** SE-23 Coupon (T-L5). */
export const couponPath = (couponId: string) => `/coupons/${couponId}` as const;

/** SE-26 Support ticket (T-L6). */
export const supportTicketPath = (ticketId: string) => `/support/${ticketId}` as const;

/** Sign-in screens: never a `returnTo` destination. */
export const AUTH_PATHS = [
  ROUTES.login,
  ROUTES.register,
  ROUTES.verifyEmail,
  ROUTES.forgotPassword,
  ROUTES.resetPassword,
] as const;

/** The storefront product page (spec 01 SF-05), for "View in store". */
export const STOREFRONT_PRODUCT_PATH = (slug: string) => `/p/${slug}` as const;

/** SE-10 Product. */
export const productPath = (productId: string) => `${ROUTES.products}/${productId}` as const;

/** SE-13 Stock history of one variant. */
export const variantStockPath = (productId: string, variantId: string) =>
  `${ROUTES.products}/${productId}/variants/${variantId}/stock` as const;

/** SE-15 Order. */
export const orderPath = (sellerOrderId: string) => `${ROUTES.orders}/${sellerOrderId}` as const;
