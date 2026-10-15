/** `/cart?notice=…` values (spec 01 SF-07 entry guard). A plain module: Server Components read it. */
export const CART_NOTICES = { needsAttention: 'needs-attention' } as const;
export type CartNotice = (typeof CART_NOTICES)[keyof typeof CART_NOTICES];
