/** Admin console routes (spec 03 §2.3). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  dashboard: '/',
  sellers: '/sellers',
  orders: '/orders',
  refunds: '/refunds',
  /** AD-32 Returns (T-M7). */
  returns: '/returns',
  /** AD-28 Tickets (T-M5). */
  support: '/support',
  /** AD-35 Coupons (T-M9). */
  coupons: '/coupons',
  /** AD-30 Reviews (T-M6). */
  reviews: '/reviews',
  /** AD-24 Users, AD-25 Customers (T-M2). */
  users: '/users',
  customers: '/customers',
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
  /** AD-40 / AD-41 (spec 03 §7.2). */
  notifications: '/notifications',
  notificationSettings: '/notifications/settings',
  login: '/login',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

/** AD-28 on the "Past 24 h target" view (AD-02 figure, T-M7). */
export const SUPPORT_SLA_PATH = `${ROUTES.support}?view=sla` as const;

/** AD-29 Support ticket (T-M5). */
export const supportTicketPath = (ticketId: string) => `${ROUTES.support}/${ticketId}` as const;

/** AD-26 Customer. */
export const customerPath = (customerId: string) => `${ROUTES.customers}/${customerId}` as const;

/**
 * AD-32 and AD-30 filtered to one customer (AD-26 "Returns", "Reviews"). The parameter name is fixed here and
 * honoured by T-M7 and T-M6 (design 01 R-78).
 */
export const customerReturnsPath = (customerId: string) =>
  `${ROUTES.returns}?customer=${customerId}` as const;
export const customerReviewsPath = (customerId: string) =>
  `${ROUTES.reviews}?customer=${customerId}` as const;

/** AD-27 Product (T-M4). */
export const productPath = (productId: string) => `/products/${productId}` as const;

/** AD-30 filtered to one product (AD-27 "Reviews"). The parameter name is fixed here and honoured by T-M6. */
export const productReviewsPath = (productId: string) => `${ROUTES.reviews}?product=${productId}` as const;

/** AD-30 filtered to one seller (AD-05 "Reviews", T-M6). */
export const sellerReviewsPath = (sellerId: string) => `${ROUTES.reviews}?seller=${sellerId}` as const;

/** AD-31 Review (T-M6). */
export const reviewPath = (reviewId: string) => `${ROUTES.reviews}/${reviewId}` as const;

/** AD-33 Return (T-M7). */
export const returnPath = (returnId: string) => `${ROUTES.returns}/${returnId}` as const;

/** Sign-in screens: never a `returnTo` destination. */
export const AUTH_PATHS = [ROUTES.login, ROUTES.forgotPassword, ROUTES.resetPassword] as const;

/** AD-05 Seller. */
export const sellerPath = (sellerId: string) => `${ROUTES.sellers}/${sellerId}` as const;

/**
 * AD-18 filtered to one owner's account (AD-05 "Finance account"). The parameter names are fixed here
 * and honoured by T-H11 (design 01 R-44, R-48).
 */
export const ownerAccountsPath = (ownerId: string, accountType: string) =>
  `${ROUTES.financeAccounts}?owner=${ownerId}&type=${accountType}` as const;

/** AD-10 New agent. */
export const NEW_AGENT_PATH = `${ROUTES.agents}/new` as const;

/** AD-11 Agent. */
export const agentPath = (agentId: string) => `${ROUTES.agents}/${agentId}` as const;

/** AD-13 Shipment. */
export const shipmentPath = (shipmentId: string) => `${ROUTES.shipments}/${shipmentId}` as const;

/** AD-12 on the All tab filtered to one agent (AD-11 "All of this agent's shipments"). */
export const agentShipmentsPath = (agentId: string) =>
  `${ROUTES.shipments}?status=all&agent=${agentId}` as const;

/** AD-15 Order. */
export const orderPath = (orderId: string) => `${ROUTES.orders}/${orderId}` as const;

/** AD-14 on the Awaiting payment tab (spec 01 SF-17 group): AD-02 queue 5 and the open seller orders figure. */
export const ORDERS_AWAITING_PAYMENT_PATH = `${ROUTES.orders}?status=awaiting-payment` as const;

/** AD-14 on the All tab filtered to one customer (AD-15 "Other orders of this customer"). */
export const customerOrdersPath = (customerId: string) =>
  `${ROUTES.orders}?status=all&customer=${customerId}` as const;

/** AD-12 on the All tab filtered to one order (AD-15). */
export const orderShipmentsPath = (orderId: string) =>
  `${ROUTES.shipments}?status=all&order=${orderId}` as const;

/** AD-36 New coupon, AD-37 Coupon (T-M9). */
export const NEW_COUPON_PATH = `${ROUTES.coupons}/new` as const;
export const couponPath = (couponId: string) => `${ROUTES.coupons}/${couponId}` as const;

/** AD-35 filtered to one seller (AD-05 "Coupons", T-M9). */
export const sellerCouponsPath = (sellerId: string) => `${ROUTES.coupons}?seller=${sellerId}` as const;

/** AD-34 Refund (T-M8). */
export const refundPath = (refundId: string) => `${ROUTES.refunds}/${refundId}` as const;

/** AD-17 Payment. */
export const paymentPath = (paymentId: string) => `/payments/${paymentId}` as const;

/**
 * AD-22 prefilled with a seller order's ledger reference (AD-15 "Ledger entries"). The parameter names are
 * fixed here and honoured by T-H11 (design 01 R-47, R-48).
 */
export const sellerOrderLedgerPath = (sellerOrderId: string) =>
  `${ROUTES.referenceLookup}?referenceType=seller_order&referenceId=${sellerOrderId}` as const;

/** AD-22 prefilled with a seller order's hold (AD-19 "seller earnings held / released" entries, T-M8). */
export const sellerOrderHoldLedgerPath = (sellerOrderId: string) =>
  `${ROUTES.referenceLookup}?referenceType=seller_order_hold&referenceId=${sellerOrderId}` as const;

/**
 * AD-20 and AD-21 prefilled for one agent (AD-11 shortcuts). The parameter names are fixed here and honoured by
 * T-H11 (design 01 R-46, R-48).
 */
export const agentRemittancePath = (agentId: string) => `${ROUTES.remittances}?agent=${agentId}` as const;
export const agentPayoutPath = (agentId: string) =>
  `${ROUTES.payouts}?payeeType=agent&payeeId=${agentId}` as const;
export const sellerPayoutPath = (sellerId: string) =>
  `${ROUTES.payouts}?payeeType=seller&payeeId=${sellerId}` as const;

/** AD-19 Account statement. */
export const accountPath = (accountId: string) => `${ROUTES.financeAccounts}/${accountId}` as const;

/** The storefront's product page (spec 01 SF-05: id or slug), for AD-27 "View in store". */
export const STOREFRONT_PRODUCT_PATH = (slug: string) => `/p/${slug}` as const;

/** The storefront's search filtered to one seller (spec 01: `/search?seller=`), for AD-05. */
export const STOREFRONT_SELLER_SEARCH_PATH = (sellerId: string) => `/search?seller=${sellerId}` as const;
