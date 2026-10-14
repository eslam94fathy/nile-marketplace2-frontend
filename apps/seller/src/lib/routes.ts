/** Seller portal routes (spec 02 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  overview: '/',
  orders: '/orders',
  products: '/products',
  finance: '/finance',
  profile: '/profile',
  security: '/security',
} as const;
