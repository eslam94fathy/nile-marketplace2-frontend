/** Storefront routes (spec 01 §2.4). Typed routes check every `Link` against the app's pages. */
export const ROUTES = {
  home: '/',
  search: '/search',
  cart: '/cart',
  login: '/login',
  register: '/register',
  orders: '/account/orders',
} as const;

/** Query parameter that carries the page to return to after sign-in (conventions §2). */
export const RETURN_TO_PARAM = 'returnTo';
/** Search text parameter (spec 01 SF-03). */
export const SEARCH_PARAM = 'q';
