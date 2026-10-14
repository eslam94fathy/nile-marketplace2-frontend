import type { paths } from './generated/schema';

// BFF allow-lists per app (design 02 §1). Each app's proxy route forwards only these operations; anything
// else answers 404 ROUTE_NOT_FOUND. allow-lists.test.ts keeps this list equal to the design table and to the
// corrected OpenAPI snapshot (operation exists, session and Idempotency-Key match).

export const BFF_APPS = ['storefront', 'seller', 'admin', 'agent'] as const;
export type BffApp = (typeof BFF_APPS)[number];

export const BFF_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const;
export type BffMethod = (typeof BFF_METHODS)[number];

type Short<P> = P extends `/api/v1${infer Rest}` ? Rest : never;

/** Paths without `/api/v1` that have an operation for `method`, e.g. `'/cart/items/{itemId}'` for PATCH. */
export type OperationPath<M extends BffMethod> = {
  [P in keyof paths]: paths[P][Lowercase<M>] extends { responses: unknown } ? Short<P> : never;
}[keyof paths];

export type AllowedOperation = {
  [M in BffMethod]: {
    readonly method: M;
    readonly path: OperationPath<M>;
    /** `bearer`: needs the session's access token; `public`: sent without one, even with a session (R-6). */
    readonly auth: 'bearer' | 'public';
    /** The backend requires an `Idempotency-Key` header, supplied by the browser (one key per intent). */
    readonly idempotencyKey: boolean;
  };
}[BffMethod];

const op = <M extends BffMethod>(
  method: M,
  path: OperationPath<M>,
  auth: 'bearer' | 'public',
  idempotencyKey = false,
): AllowedOperation => ({ method, path, auth, idempotencyKey }) as AllowedOperation;

export const BFF_ALLOW_LISTS: Readonly<Record<BffApp, readonly AllowedOperation[]>> = {
  storefront: [
    op('POST', '/auth/email/resend-otp', 'public'),
    op('POST', '/auth/password/forgot', 'public'),
    op('POST', '/auth/password/reset', 'public'),
    op('POST', '/auth/register/customer', 'public'),
    op('GET', '/cart', 'bearer'),
    op('DELETE', '/cart', 'bearer'),
    op('POST', '/cart/items', 'bearer'),
    op('PATCH', '/cart/items/{itemId}', 'bearer'),
    op('DELETE', '/cart/items/{itemId}', 'bearer'),
    op('GET', '/categories', 'public'),
    op('GET', '/categories/{categoryId}/attributes', 'public'),
    op('POST', '/checkout', 'bearer', true),
    op('GET', '/governorates', 'public'),
    op('GET', '/me', 'bearer'),
    op('PATCH', '/me', 'bearer'),
    op('GET', '/me/addresses', 'bearer'),
    op('POST', '/me/addresses', 'bearer'),
    op('GET', '/me/addresses/{addressId}', 'bearer'),
    op('PATCH', '/me/addresses/{addressId}', 'bearer'),
    op('DELETE', '/me/addresses/{addressId}', 'bearer'),
    op('GET', '/orders', 'bearer'),
    op('GET', '/orders/{orderId}', 'bearer'),
    op('POST', '/orders/{orderId}/payment/kashier-session', 'bearer'),
    op('POST', '/orders/{orderId}/seller-orders/{sellerOrderId}/cancel', 'bearer', true),
    op('GET', '/products', 'public'),
    op('GET', '/products/{idOrSlug}', 'public'),
  ],
  seller: [
    op('POST', '/auth/email/resend-otp', 'public'),
    op('POST', '/auth/password/forgot', 'public'),
    op('POST', '/auth/password/reset', 'public'),
    op('POST', '/auth/register/seller', 'public'),
    op('GET', '/categories', 'public'),
    op('GET', '/categories/{categoryId}/attributes', 'public'),
    op('GET', '/governorates', 'public'),
    op('GET', '/seller/finance/balance', 'bearer'),
    op('GET', '/seller/finance/entries', 'bearer'),
    op('GET', '/seller/finance/payouts', 'bearer'),
    op('GET', '/seller/orders', 'bearer'),
    op('GET', '/seller/orders/{sellerOrderId}', 'bearer'),
    op('POST', '/seller/orders/{sellerOrderId}/accept', 'bearer'),
    op('POST', '/seller/orders/{sellerOrderId}/cancel', 'bearer', true),
    op('POST', '/seller/orders/{sellerOrderId}/items/{itemId}/cancel', 'bearer', true),
    op('POST', '/seller/orders/{sellerOrderId}/ready', 'bearer'),
    op('POST', '/seller/orders/{sellerOrderId}/return-received', 'bearer', true),
    op('GET', '/seller/products', 'bearer'),
    op('POST', '/seller/products', 'bearer'),
    op('GET', '/seller/products/{productId}', 'bearer'),
    op('PATCH', '/seller/products/{productId}', 'bearer'),
    op('DELETE', '/seller/products/{productId}', 'bearer'),
    op('POST', '/seller/products/{productId}/activate', 'bearer'),
    op('POST', '/seller/products/{productId}/deactivate', 'bearer'),
    op('POST', '/seller/products/{productId}/variants', 'bearer'),
    op('PATCH', '/seller/products/{productId}/variants/{variantId}', 'bearer'),
    op('DELETE', '/seller/products/{productId}/variants/{variantId}', 'bearer'),
    op('GET', '/seller/profile', 'bearer'),
    op('PATCH', '/seller/profile', 'bearer'),
    op('POST', '/seller/profile/reapply', 'bearer'),
    op('POST', '/seller/variants/{variantId}/stock-adjustments', 'bearer', true),
    op('GET', '/seller/variants/{variantId}/stock-movements', 'bearer'),
  ],
  admin: [
    op('POST', '/admin/admins', 'bearer'),
    op('GET', '/admin/admins', 'bearer'),
    op('PATCH', '/admin/attributes/{attributeId}', 'bearer'),
    op('DELETE', '/admin/attributes/{attributeId}', 'bearer'),
    op('POST', '/admin/attributes/{attributeId}/options', 'bearer'),
    op('GET', '/admin/categories', 'bearer'),
    op('POST', '/admin/categories', 'bearer'),
    op('PATCH', '/admin/categories/{categoryId}', 'bearer'),
    op('POST', '/admin/categories/{categoryId}/attributes', 'bearer'),
    op('POST', '/admin/delivery-agents', 'bearer'),
    op('GET', '/admin/delivery-agents', 'bearer'),
    op('GET', '/admin/delivery-agents/{agentId}', 'bearer'),
    op('PATCH', '/admin/delivery-agents/{agentId}', 'bearer'),
    op('POST', '/admin/delivery-agents/{agentId}/activate', 'bearer'),
    op('POST', '/admin/delivery-agents/{agentId}/deactivate', 'bearer'),
    op('GET', '/admin/finance/accounts', 'bearer'),
    op('GET', '/admin/finance/accounts/{accountId}', 'bearer'),
    op('GET', '/admin/finance/accounts/{accountId}/entries', 'bearer'),
    op('POST', '/admin/finance/cod-remittances', 'bearer', true),
    op('GET', '/admin/finance/cod-remittances', 'bearer'),
    op('GET', '/admin/finance/entries', 'bearer'),
    op('POST', '/admin/finance/payouts', 'bearer', true),
    op('GET', '/admin/finance/payouts', 'bearer'),
    op('GET', '/admin/governorates', 'bearer'),
    op('PATCH', '/admin/governorates/{governorateId}', 'bearer'),
    op('PATCH', '/admin/options/{optionId}', 'bearer'),
    op('DELETE', '/admin/options/{optionId}', 'bearer'),
    op('GET', '/admin/orders', 'bearer'),
    op('GET', '/admin/orders/{orderId}', 'bearer'),
    op('GET', '/admin/orders/{orderId}/payment', 'bearer'),
    op('GET', '/admin/payments/{paymentId}', 'bearer'),
    op('GET', '/admin/payments/refunds', 'bearer'),
    op('POST', '/admin/payments/refunds/{refundId}/record', 'bearer', true),
    op('GET', '/admin/sellers', 'bearer'),
    op('GET', '/admin/sellers/{sellerId}', 'bearer'),
    op('POST', '/admin/sellers/{sellerId}/approve', 'bearer'),
    op('PUT', '/admin/sellers/{sellerId}/commission-rate', 'bearer'),
    op('POST', '/admin/sellers/{sellerId}/reinstate', 'bearer'),
    op('POST', '/admin/sellers/{sellerId}/reject', 'bearer'),
    op('POST', '/admin/sellers/{sellerId}/suspend', 'bearer'),
    op('GET', '/admin/settings/commission', 'bearer'),
    op('PUT', '/admin/settings/commission', 'bearer'),
    op('GET', '/admin/settings/delivery', 'bearer'),
    op('PUT', '/admin/settings/delivery', 'bearer'),
    op('GET', '/admin/shipments', 'bearer'),
    op('GET', '/admin/shipments/{shipmentId}', 'bearer'),
    op('POST', '/admin/shipments/{shipmentId}/assign', 'bearer'),
    op('POST', '/admin/users/{userId}/reactivate', 'bearer'),
    op('POST', '/admin/users/{userId}/resend-invite', 'bearer'),
    op('POST', '/admin/users/{userId}/suspend', 'bearer'),
    op('POST', '/auth/password/forgot', 'public'),
    op('POST', '/auth/password/reset', 'public'),
  ],
  agent: [
    op('PATCH', '/agent/availability', 'bearer'),
    op('GET', '/agent/finance/balances', 'bearer'),
    op('GET', '/agent/finance/entries', 'bearer'),
    op('GET', '/agent/finance/remittances', 'bearer'),
    op('GET', '/agent/profile', 'bearer'),
    op('GET', '/agent/shipments', 'bearer'),
    op('GET', '/agent/shipments/{shipmentId}', 'bearer'),
    op('POST', '/agent/shipments/{shipmentId}/delivered', 'bearer', true),
    op('POST', '/agent/shipments/{shipmentId}/failed-attempt', 'bearer', true),
    op('POST', '/agent/shipments/{shipmentId}/out-for-delivery', 'bearer'),
    op('POST', '/agent/shipments/{shipmentId}/picked-up', 'bearer'),
    op('POST', '/agent/shipments/{shipmentId}/returned', 'bearer', true),
    op('POST', '/auth/password/forgot', 'public'),
    op('POST', '/auth/password/reset', 'public'),
    op('GET', '/governorates', 'public'),
  ],
};
