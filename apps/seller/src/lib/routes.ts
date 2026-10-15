/** Seller portal routes (spec 02 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  overview: '/',
  orders: '/orders',
  products: '/products',
  newProduct: '/products/new',
  finance: '/finance',
  profile: '/profile',
  security: '/security',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

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
