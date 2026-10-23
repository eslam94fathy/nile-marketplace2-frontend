import type { components } from './generated/schema';

/** A component schema by name: `Schema<'OrderDetailDto'>`. */
export type Schema<Name extends keyof components['schemas']> = components['schemas'][Name];
