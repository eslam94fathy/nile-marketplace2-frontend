/** Seller portal routes (spec 02 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  overview: '/',
  orders: '/orders',
  products: '/products',
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
