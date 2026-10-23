import type { ActorRole, UserRole, UserStatus } from '../enums';
import type { Labels } from './types';

/** Spec 03 §4.3 (actor roles). */
export const USER_ROLE_LABELS = {
  customer: 'Customer',
  seller: 'Seller',
  admin: 'Admin',
  delivery_agent: 'Agent',
} as const satisfies Labels<UserRole>;

/** Spec 03 §4.3. */
export const ACTOR_ROLE_LABELS = {
  ...USER_ROLE_LABELS,
  system: 'System',
} as const satisfies Labels<ActorRole>;

/** Decided 2026-10-14 (T-B6): short labels, matching the admin tabs Invited / Active / Suspended. */
export const USER_STATUS_LABELS = {
  pending_email_verification: 'Email not verified',
  invited: 'Invited',
  active: 'Active',
  suspended: 'Suspended',
} as const satisfies Labels<UserStatus>;
