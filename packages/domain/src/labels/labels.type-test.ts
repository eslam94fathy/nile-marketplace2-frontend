// Compile-time checks (run by `tsc` in `npm run typecheck`): a label map that misses a value, or has one
// the enum doesn't know, fails type-checking. Each `@ts-expect-error` must stay an error.
import type { OrderStatus, VariantStatus } from '../enums';
import { ORDER_STATUS_LABELS } from './orders';
import type { Labels } from './types';

// @ts-expect-error `inactive` is missing.
export const missingLabel = { active: 'Active' } as const satisfies Labels<VariantStatus>;

export const extraLabel = {
  active: 'Active',
  inactive: 'Inactive',
  // @ts-expect-error `archived` is not a VariantStatus.
  archived: 'Archived',
} as const satisfies Labels<VariantStatus>;

// The real map against a simulated new backend value: it would need a label too.
// @ts-expect-error `on_hold` is missing.
export const newValue = ORDER_STATUS_LABELS.customer satisfies Labels<OrderStatus | 'on_hold'>;
