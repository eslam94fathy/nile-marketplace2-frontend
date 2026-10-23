// Compile-time checks (run by `tsc` in `npm run typecheck`; no runtime code, no runtime import of @nile/api).
// Each domain enum must equal the generated API union in both directions (design 01 R-15), so a value
// added or removed by the backend fails type-check here.
import type { components } from '@nile/api/schema';
import type {
  AccountType,
  ActorRole,
  AgentStatus,
  AttemptFailureReason,
  CartLineIssue,
  ItemCancelReason,
  LedgerEntryType,
  LedgerReferenceType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ProductStatus,
  RefundReason,
  RefundStatus,
  SellerOrderCancelReason,
  SellerOrderStatus,
  SellerStatus,
  ShipmentStatus,
  StockMovementType,
  UserRole,
  UserStatus,
  VariantStatus,
} from './enums';

/** Mutual assignability (no `any` in these types, so this is exact enough here). */
type Equals<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;
type S = components['schemas'];

export type DomainEnumChecks = [
  Expect<Equals<UserRole, S['AuthUserDto']['role']>>,
  Expect<Equals<UserStatus, S['AuthUserDto']['status']>>,
  Expect<Equals<ActorRole, S['AdminHistoryEntryDto']['actorRole']>>,
  // Shipment history only records admin, agent and system actors: a subset of ActorRole.
  Expect<S['ShipmentHistoryDto']['actorRole'] extends ActorRole ? true : false>,
  Expect<Equals<SellerStatus, S['SellerProfileDto']['status']>>,
  Expect<Equals<ProductStatus, S['SellerProductDto']['status']>>,
  Expect<Equals<VariantStatus, S['SellerVariantDto']['status']>>,
  Expect<Equals<StockMovementType, S['StockMovementDto']['type']>>,
  Expect<Equals<CartLineIssue | null, S['CartItemDto']['issue']>>,
  Expect<Equals<OrderStatus, S['OrderDetailDto']['status']>>,
  Expect<Equals<SellerOrderStatus, S['SellerOrderDto']['status']>>,
  Expect<Equals<SellerOrderCancelReason, NonNullable<S['SellerOrderDto']['cancelReason']>>>,
  Expect<Equals<ItemCancelReason, S['CancelOrderItemDto']['reason']>>,
  Expect<Equals<PaymentMethod, S['OrderDetailDto']['paymentMethod']>>,
  Expect<Equals<PaymentStatus, S['AdminPaymentDto']['status']>>,
  Expect<Equals<RefundReason, S['RefundDto']['reason']>>,
  Expect<Equals<RefundStatus, S['RefundDto']['status']>>,
  Expect<Equals<ShipmentStatus, S['AgentShipmentDto']['status']>>,
  Expect<Equals<AgentStatus, S['AdminAgentDto']['status']>>,
  Expect<Equals<AttemptFailureReason, S['FailedAttemptDto']['reason']>>,
  Expect<Equals<AccountType, S['AccountDto']['accountType']>>,
  Expect<Equals<LedgerEntryType, S['LedgerEntryDto']['entryType']>>,
  Expect<Equals<LedgerReferenceType, S['LedgerEntryDto']['referenceType']>>,
];
