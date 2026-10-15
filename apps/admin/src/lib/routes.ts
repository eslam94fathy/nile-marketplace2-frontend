/** Admin console routes (spec 03 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  dashboard: '/',
  sellers: '/sellers',
  orders: '/orders',
  refunds: '/refunds',
  categories: '/catalog/categories',
  shipments: '/delivery/shipments',
  agents: '/delivery/agents',
  deliverySettings: '/delivery/settings',
  financeAccounts: '/finance/accounts',
  remittances: '/finance/remittances',
  payouts: '/finance/payouts',
  referenceLookup: '/finance/lookup',
  commission: '/settings/commission',
  admins: '/admins',
  security: '/security',
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

/** Sign-in screens: never a `returnTo` destination. */
export const AUTH_PATHS = [ROUTES.login, ROUTES.forgotPassword, ROUTES.resetPassword] as const;
