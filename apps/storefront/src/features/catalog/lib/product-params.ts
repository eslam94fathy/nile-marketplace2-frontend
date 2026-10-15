/**
 * Product page parameters (spec 01 SF-05): `?variant=<id>` (shareable, kept through sign-in) and `?qty=<n>`
 * (only on the way back from sign-in). A plain module, not the client component's: a Server Component that
 * imports a constant from a `'use client'` module gets a client reference, not the value.
 */
export const PRODUCT_PARAMS = { variant: 'variant', quantity: 'qty' } as const;
