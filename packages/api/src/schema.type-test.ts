// Compile-time checks on the generated types (run by `tsc` in `npm run typecheck`; no runtime code).
// They pin what the corrections in scripts/openapi-fix.ts must produce; a wrong regeneration fails type-check.
import type { components, paths } from './generated/schema';

/** Mutual assignability (no `any` in these types, so this is exact enough here). */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type S = components['schemas'];
type ProductQuery = NonNullable<paths['/api/v1/products']['get']['parameters']['query']>;

export type GeneratedTypeChecks = [
  // OA-1 responses: null, not undefined.
  Expect<Equals<S['GovernorateDto']['deliveryFee'], string | null>>,
  Expect<Equals<S['CartDto']['id'], string | null>>,
  Expect<Equals<S['CartItemDto']['issue'], 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | null>>,
  Expect<Equals<S['CheckoutResultDto']['kashier'], S['KashierCheckoutDto'] | null>>,
  // OA-1 requests: optional and nullable where the spec says so; required and nullable for the fee.
  Expect<Equals<S['UpdateAddressDto']['floor'], string | null | undefined>>,
  Expect<Equals<S['UpdateGovernorateDto']['deliveryFee'], string | null>>,
  // Untouched request fields stay non-nullable.
  Expect<Equals<S['CreateAddressDto']['street'], string>>,
  // OA-5: no phantom property.
  Expect<Equals<'__atLeastOneField' extends keyof S['UpdateAddressDto'] ? true : false, false>>,
  // OA-4: idOrSlug is any string.
  Expect<Equals<paths['/api/v1/products/{idOrSlug}']['get']['parameters']['path']['idOrSlug'], string>>,
  // OA-7: the literal attr parameter is gone, the others remain.
  Expect<Equals<'attr.{code}[in]' extends keyof ProductQuery ? true : false, false>>,
  Expect<Equals<'q' extends keyof ProductQuery ? true : false, true>>,
  // The error envelope keeps `details` optional (not nullable).
  Expect<Equals<undefined extends S['ErrorEnvelope']['error']['details'] ? true : false, true>>,
];
