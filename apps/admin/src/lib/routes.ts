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

/** AD-05 Seller. */
export const sellerPath = (sellerId: string) => `${ROUTES.sellers}/${sellerId}` as const;

/**
 * AD-18 filtered to one owner's account (AD-05 "Finance account"). The parameter names are fixed here for
 * T-H11 to honour [PROPOSED, design 01 R-44].
 */
export const ownerAccountsPath = (ownerId: string, accountType: string) =>
  `${ROUTES.financeAccounts}?owner=${ownerId}&type=${accountType}` as const;

/** The storefront's search filtered to one seller (spec 01: `/search?seller=`), for AD-05. */
export const STOREFRONT_SELLER_SEARCH_PATH = (sellerId: string) => `/search?seller=${sellerId}` as const;
