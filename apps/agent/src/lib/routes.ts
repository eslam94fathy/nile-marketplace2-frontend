/** Delivery agent routes (spec 04 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  shipments: '/',
  history: '/history',
  finance: '/finance',
  me: '/me',
} as const;
