// Seller support copy (spec 02 SE-24 … SE-26): the screens' own copy lives in @nile/support-screens.

export const SUPPORT_COPY = {
  /** TL1-Q1 (approved): the subject of a ticket opened from a blocked product (SE-Q-14). */
  blockedProductSubject: (product: string) => `Blocked product: ${product}`,
  /** SE-15 button (as storefront SF-18, TL6-COPY). */
  getHelpWithOrder: 'Get help with this order',
  /** SE-19 link (TL6-COPY). */
  contactSupport: 'Contact support',
} as const;
