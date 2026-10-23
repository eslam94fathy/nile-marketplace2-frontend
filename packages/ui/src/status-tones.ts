import type {
  AgentStatus,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  RefundStatus,
  SellerOrderStatus,
  SellerStatus,
  ShipmentStatus,
  UserStatus,
  VariantStatus,
} from '@nile/domain';

// Badge colour per status value (decided 2026-10-14, T-C2: tone by what the user must do). Colour only
// supports the label, never replaces it (conventions §10). Exhaustive: a new backend value fails type-check.
//   warning     waiting on someone        success   done well
//   destructive failed or blocked         neutral   closed or inactive
//   info        in progress

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'destructive';
export type Tones<Value extends string> = Readonly<Record<Value, Tone>>;

export const ORDER_STATUS_TONES = {
  pending_payment: 'warning',
  placed: 'warning',
  in_progress: 'info',
  completed: 'success',
  partially_completed: 'success',
  cancelled: 'neutral',
} as const satisfies Tones<OrderStatus>;

export const SELLER_ORDER_STATUS_TONES = {
  pending_payment: 'warning',
  placed: 'warning',
  accepted: 'info',
  ready_for_pickup: 'info',
  picked_up: 'info',
  out_for_delivery: 'info',
  delivery_failed: 'warning',
  returning_to_seller: 'info',
  returned_to_seller: 'neutral',
  delivered: 'success',
  cancelled: 'neutral',
} as const satisfies Tones<SellerOrderStatus>;

export const SHIPMENT_STATUS_TONES = {
  unassigned: 'warning',
  assigned: 'info',
  picked_up: 'info',
  out_for_delivery: 'info',
  delivery_failed: 'warning',
  returning_to_seller: 'info',
  returned_to_seller: 'neutral',
  delivered: 'success',
  cancelled: 'neutral',
} as const satisfies Tones<ShipmentStatus>;

export const PAYMENT_STATUS_TONES = {
  pending: 'warning',
  partially_collected: 'info',
  collected: 'success',
  cancelled: 'neutral',
  initiated: 'warning',
  paid: 'success',
  failed: 'destructive',
  expired: 'destructive',
  partially_refunded_manually: 'neutral',
  refunded_manually: 'neutral',
} as const satisfies Tones<PaymentStatus>;

export const REFUND_STATUS_TONES = {
  pending_manual: 'warning',
  recorded: 'success',
} as const satisfies Tones<RefundStatus>;

export const SELLER_STATUS_TONES = {
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'destructive',
  suspended: 'destructive',
} as const satisfies Tones<SellerStatus>;

export const USER_STATUS_TONES = {
  pending_email_verification: 'warning',
  invited: 'warning',
  active: 'success',
  suspended: 'destructive',
} as const satisfies Tones<UserStatus>;

export const PRODUCT_STATUS_TONES = {
  draft: 'neutral',
  active: 'success',
  inactive: 'neutral',
} as const satisfies Tones<ProductStatus>;

export const VARIANT_STATUS_TONES = {
  active: 'success',
  inactive: 'neutral',
} as const satisfies Tones<VariantStatus>;

export const AGENT_STATUS_TONES = {
  active: 'success',
  inactive: 'neutral',
} as const satisfies Tones<AgentStatus>;
