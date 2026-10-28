# Design 02 — Data layer: BFF allow-lists, queries, mutations

Status: **v1.0 APPROVED (2026-10-14); v1.1 APPROVED (2026-10-23): §5 Release 2, every recommendation and [PROPOSED] item accepted (T-J0).** Approved by the user with every recommendation in `01-system-design.md` §14 (DQ-1…DQ-9). Companion of `01-system-design.md`.
Generated parts (§1) come from the OpenAPI snapshot (backend `ecbcd19`, regenerated in T-J1) and are regenerated with the snapshot; the BFF code reads the same data from `packages/api/src/allow-lists.ts`, which a unit test compares against this table.

---

## 1. BFF allow-lists per app [VERIFIED against OpenAPI, generated]

Not reachable through any proxy, by design: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/email/verify`, `/auth/invite/accept`, `/auth/password/change` (dedicated auth routes, `01` §4.1), `POST /webhooks/kashier`, `GET /health/*`.

#### storefront (64 operations)

| Method | Path | Session | Idempotency-Key |
|---|---|---|---|
| POST | `/auth/email/resend-otp` | none (public) | – |
| POST | `/auth/password/forgot` | none (public) | – |
| POST | `/auth/password/reset` | none (public) | – |
| POST | `/auth/register/customer` | none (public) | – |
| GET | `/cart` | Bearer from session | – |
| DELETE | `/cart` | Bearer from session | – |
| POST | `/cart/coupon-preview` | Bearer from session | – |
| POST | `/cart/items` | Bearer from session | – |
| PATCH | `/cart/items/{itemId}` | Bearer from session | – |
| DELETE | `/cart/items/{itemId}` | Bearer from session | – |
| GET | `/categories` | none (public) | – |
| GET | `/categories/{categoryId}/attributes` | none (public) | – |
| POST | `/checkout` | Bearer from session | required, from client |
| GET | `/governorates` | none (public) | – |
| GET | `/me` | Bearer from session | – |
| PATCH | `/me` | Bearer from session | – |
| GET | `/me/addresses` | Bearer from session | – |
| POST | `/me/addresses` | Bearer from session | – |
| GET | `/me/addresses/{addressId}` | Bearer from session | – |
| PATCH | `/me/addresses/{addressId}` | Bearer from session | – |
| DELETE | `/me/addresses/{addressId}` | Bearer from session | – |
| GET | `/me/notification-preferences` | Bearer from session | – |
| PUT | `/me/notification-preferences` | Bearer from session | – |
| GET | `/me/notifications` | Bearer from session | – |
| POST | `/me/notifications/read-all` | Bearer from session | – |
| GET | `/me/notifications/unread-count` | Bearer from session | – |
| POST | `/me/notifications/{notificationId}/read` | Bearer from session | – |
| POST | `/me/push-subscriptions` | Bearer from session | – |
| POST | `/me/push-subscriptions/unregister` | Bearer from session | – |
| GET | `/me/reviewable-items` | Bearer from session | – |
| GET | `/me/reviews` | Bearer from session | – |
| GET | `/me/reviews/{reviewId}` | Bearer from session | – |
| PATCH | `/me/reviews/{reviewId}` | Bearer from session | – |
| DELETE | `/me/reviews/{reviewId}` | Bearer from session | – |
| GET | `/me/wishlist` | Bearer from session | – |
| GET | `/me/wishlist/product-ids` | Bearer from session | – |
| PUT | `/me/wishlist/{productId}` | Bearer from session | – |
| DELETE | `/me/wishlist/{productId}` | Bearer from session | – |
| POST | `/media/uploads` | Bearer from session | – |
| POST | `/media/uploads/{mediaId}/complete` | Bearer from session | – |
| GET | `/media/{mediaId}` | Bearer from session | – |
| GET | `/orders` | Bearer from session | – |
| GET | `/orders/{orderId}` | Bearer from session | – |
| POST | `/orders/{orderId}/payment/kashier-session` | Bearer from session | – |
| POST | `/orders/{orderId}/seller-orders/{sellerOrderId}/cancel` | Bearer from session | required, from client |
| GET | `/orders/{orderId}/seller-orders/{sellerOrderId}/returnable-items` | Bearer from session | – |
| GET | `/products` | none (public) | – |
| GET | `/products/{idOrSlug}` | none (public) | – |
| GET | `/products/{productId}/reviews` | none (public) | – |
| GET | `/products/{productId}/reviews/summary` | none (public) | – |
| GET | `/push/config` | Bearer from session | – |
| GET | `/returns` | Bearer from session | – |
| POST | `/returns` | Bearer from session | required, from client |
| GET | `/returns/{returnId}` | Bearer from session | – |
| POST | `/returns/{returnId}/cancel` | Bearer from session | – |
| POST | `/returns/{returnId}/escalate` | Bearer from session | – |
| POST | `/reviews` | Bearer from session | – |
| GET | `/sellers/{sellerId}` | none (public) | – |
| GET | `/support/tickets` | Bearer from session | – |
| POST | `/support/tickets` | Bearer from session | required, from client |
| GET | `/support/tickets/{ticketId}` | Bearer from session | – |
| GET | `/support/tickets/{ticketId}/messages` | Bearer from session | – |
| POST | `/support/tickets/{ticketId}/messages` | Bearer from session | required, from client |
| POST | `/support/tickets/{ticketId}/read` | Bearer from session | – |

#### seller (67 operations)

| Method | Path | Session | Idempotency-Key |
|---|---|---|---|
| POST | `/auth/email/resend-otp` | none (public) | – |
| POST | `/auth/password/forgot` | none (public) | – |
| POST | `/auth/password/reset` | none (public) | – |
| POST | `/auth/register/seller` | none (public) | – |
| GET | `/categories` | none (public) | – |
| GET | `/categories/{categoryId}/attributes` | none (public) | – |
| GET | `/governorates` | none (public) | – |
| GET | `/me/notification-preferences` | Bearer from session | – |
| PUT | `/me/notification-preferences` | Bearer from session | – |
| GET | `/me/notifications` | Bearer from session | – |
| POST | `/me/notifications/read-all` | Bearer from session | – |
| GET | `/me/notifications/unread-count` | Bearer from session | – |
| POST | `/me/notifications/{notificationId}/read` | Bearer from session | – |
| POST | `/me/push-subscriptions` | Bearer from session | – |
| POST | `/me/push-subscriptions/unregister` | Bearer from session | – |
| POST | `/media/uploads` | Bearer from session | – |
| POST | `/media/uploads/{mediaId}/complete` | Bearer from session | – |
| GET | `/media/{mediaId}` | Bearer from session | – |
| GET | `/push/config` | Bearer from session | – |
| GET | `/seller/coupons` | Bearer from session | – |
| POST | `/seller/coupons` | Bearer from session | – |
| GET | `/seller/coupons/{couponId}` | Bearer from session | – |
| PATCH | `/seller/coupons/{couponId}` | Bearer from session | – |
| GET | `/seller/finance/balance` | Bearer from session | – |
| GET | `/seller/finance/entries` | Bearer from session | – |
| GET | `/seller/finance/holds` | Bearer from session | – |
| GET | `/seller/finance/payouts` | Bearer from session | – |
| GET | `/seller/orders` | Bearer from session | – |
| GET | `/seller/orders/{sellerOrderId}` | Bearer from session | – |
| POST | `/seller/orders/{sellerOrderId}/accept` | Bearer from session | – |
| POST | `/seller/orders/{sellerOrderId}/cancel` | Bearer from session | required, from client |
| POST | `/seller/orders/{sellerOrderId}/items/{itemId}/cancel` | Bearer from session | required, from client |
| POST | `/seller/orders/{sellerOrderId}/ready` | Bearer from session | – |
| POST | `/seller/orders/{sellerOrderId}/return-received` | Bearer from session | required, from client |
| GET | `/seller/products` | Bearer from session | – |
| POST | `/seller/products` | Bearer from session | – |
| GET | `/seller/products/{productId}` | Bearer from session | – |
| PATCH | `/seller/products/{productId}` | Bearer from session | – |
| DELETE | `/seller/products/{productId}` | Bearer from session | – |
| POST | `/seller/products/{productId}/activate` | Bearer from session | – |
| POST | `/seller/products/{productId}/deactivate` | Bearer from session | – |
| POST | `/seller/products/{productId}/images` | Bearer from session | – |
| PUT | `/seller/products/{productId}/images/order` | Bearer from session | – |
| PATCH | `/seller/products/{productId}/images/{imageId}` | Bearer from session | – |
| DELETE | `/seller/products/{productId}/images/{imageId}` | Bearer from session | – |
| POST | `/seller/products/{productId}/variants` | Bearer from session | – |
| PATCH | `/seller/products/{productId}/variants/{variantId}` | Bearer from session | – |
| DELETE | `/seller/products/{productId}/variants/{variantId}` | Bearer from session | – |
| GET | `/seller/profile` | Bearer from session | – |
| PATCH | `/seller/profile` | Bearer from session | – |
| POST | `/seller/profile/reapply` | Bearer from session | – |
| GET | `/seller/returns` | Bearer from session | – |
| GET | `/seller/returns/{returnId}` | Bearer from session | – |
| POST | `/seller/returns/{returnId}/approve` | Bearer from session | – |
| POST | `/seller/returns/{returnId}/confirm-receipt` | Bearer from session | required, from client |
| POST | `/seller/returns/{returnId}/dispute` | Bearer from session | – |
| POST | `/seller/returns/{returnId}/reject` | Bearer from session | – |
| GET | `/seller/reviews` | Bearer from session | – |
| POST | `/seller/reviews/{reviewId}/reply` | Bearer from session | – |
| POST | `/seller/variants/{variantId}/stock-adjustments` | Bearer from session | required, from client |
| GET | `/seller/variants/{variantId}/stock-movements` | Bearer from session | – |
| GET | `/support/tickets` | Bearer from session | – |
| POST | `/support/tickets` | Bearer from session | required, from client |
| GET | `/support/tickets/{ticketId}` | Bearer from session | – |
| GET | `/support/tickets/{ticketId}/messages` | Bearer from session | – |
| POST | `/support/tickets/{ticketId}/messages` | Bearer from session | required, from client |
| POST | `/support/tickets/{ticketId}/read` | Bearer from session | – |

#### admin (103 operations)

| Method | Path | Session | Idempotency-Key |
|---|---|---|---|
| GET | `/admin/admins` | Bearer from session | – |
| POST | `/admin/admins` | Bearer from session | – |
| PATCH | `/admin/attributes/{attributeId}` | Bearer from session | – |
| DELETE | `/admin/attributes/{attributeId}` | Bearer from session | – |
| POST | `/admin/attributes/{attributeId}/options` | Bearer from session | – |
| GET | `/admin/audit-log` | Bearer from session | – |
| GET | `/admin/audit-log/{entryId}` | Bearer from session | – |
| GET | `/admin/categories` | Bearer from session | – |
| POST | `/admin/categories` | Bearer from session | – |
| PATCH | `/admin/categories/{categoryId}` | Bearer from session | – |
| POST | `/admin/categories/{categoryId}/attributes` | Bearer from session | – |
| PUT | `/admin/categories/{categoryId}/image` | Bearer from session | – |
| DELETE | `/admin/categories/{categoryId}/image` | Bearer from session | – |
| GET | `/admin/coupons` | Bearer from session | – |
| POST | `/admin/coupons` | Bearer from session | – |
| GET | `/admin/coupons/{couponId}` | Bearer from session | – |
| PATCH | `/admin/coupons/{couponId}` | Bearer from session | – |
| POST | `/admin/coupons/{couponId}/block` | Bearer from session | – |
| POST | `/admin/coupons/{couponId}/unblock` | Bearer from session | – |
| GET | `/admin/customers` | Bearer from session | – |
| GET | `/admin/customers/{customerId}` | Bearer from session | – |
| GET | `/admin/dashboard` | Bearer from session | – |
| GET | `/admin/delivery-agents` | Bearer from session | – |
| POST | `/admin/delivery-agents` | Bearer from session | – |
| GET | `/admin/delivery-agents/{agentId}` | Bearer from session | – |
| PATCH | `/admin/delivery-agents/{agentId}` | Bearer from session | – |
| POST | `/admin/delivery-agents/{agentId}/activate` | Bearer from session | – |
| POST | `/admin/delivery-agents/{agentId}/deactivate` | Bearer from session | – |
| GET | `/admin/finance/accounts` | Bearer from session | – |
| GET | `/admin/finance/accounts/{accountId}` | Bearer from session | – |
| GET | `/admin/finance/accounts/{accountId}/entries` | Bearer from session | – |
| GET | `/admin/finance/cod-remittances` | Bearer from session | – |
| POST | `/admin/finance/cod-remittances` | Bearer from session | required, from client |
| GET | `/admin/finance/entries` | Bearer from session | – |
| GET | `/admin/finance/payouts` | Bearer from session | – |
| POST | `/admin/finance/payouts` | Bearer from session | required, from client |
| GET | `/admin/governorates` | Bearer from session | – |
| PATCH | `/admin/governorates/{governorateId}` | Bearer from session | – |
| PATCH | `/admin/options/{optionId}` | Bearer from session | – |
| DELETE | `/admin/options/{optionId}` | Bearer from session | – |
| GET | `/admin/orders` | Bearer from session | – |
| GET | `/admin/orders/{orderId}` | Bearer from session | – |
| POST | `/admin/orders/{orderId}/cancel` | Bearer from session | required, from client |
| GET | `/admin/orders/{orderId}/payment` | Bearer from session | – |
| GET | `/admin/payments/refunds` | Bearer from session | – |
| GET | `/admin/payments/refunds/{refundId}` | Bearer from session | – |
| POST | `/admin/payments/refunds/{refundId}/record` | Bearer from session | required, from client |
| POST | `/admin/payments/refunds/{refundId}/retry` | Bearer from session | – |
| GET | `/admin/payments/{paymentId}` | Bearer from session | – |
| GET | `/admin/products/{productId}` | Bearer from session | – |
| POST | `/admin/products/{productId}/block` | Bearer from session | – |
| POST | `/admin/products/{productId}/unblock` | Bearer from session | – |
| GET | `/admin/returns` | Bearer from session | – |
| GET | `/admin/returns/{returnId}` | Bearer from session | – |
| POST | `/admin/returns/{returnId}/decide` | Bearer from session | – |
| POST | `/admin/returns/{returnId}/resolve-dispute` | Bearer from session | required, from client |
| GET | `/admin/reviews` | Bearer from session | – |
| GET | `/admin/reviews/{reviewId}` | Bearer from session | – |
| POST | `/admin/reviews/{reviewId}/hide` | Bearer from session | – |
| POST | `/admin/reviews/{reviewId}/reply/hide` | Bearer from session | – |
| POST | `/admin/reviews/{reviewId}/reply/unhide` | Bearer from session | – |
| POST | `/admin/reviews/{reviewId}/unhide` | Bearer from session | – |
| POST | `/admin/seller-orders/{sellerOrderId}/cancel` | Bearer from session | required, from client |
| GET | `/admin/sellers` | Bearer from session | – |
| GET | `/admin/sellers/{sellerId}` | Bearer from session | – |
| POST | `/admin/sellers/{sellerId}/approve` | Bearer from session | – |
| PUT | `/admin/sellers/{sellerId}/commission-rate` | Bearer from session | – |
| POST | `/admin/sellers/{sellerId}/reinstate` | Bearer from session | – |
| POST | `/admin/sellers/{sellerId}/reject` | Bearer from session | – |
| POST | `/admin/sellers/{sellerId}/suspend` | Bearer from session | – |
| GET | `/admin/settings/commission` | Bearer from session | – |
| PUT | `/admin/settings/commission` | Bearer from session | – |
| GET | `/admin/settings/delivery` | Bearer from session | – |
| PUT | `/admin/settings/delivery` | Bearer from session | – |
| GET | `/admin/shipments` | Bearer from session | – |
| GET | `/admin/shipments/{shipmentId}` | Bearer from session | – |
| POST | `/admin/shipments/{shipmentId}/assign` | Bearer from session | – |
| GET | `/admin/support/tickets` | Bearer from session | – |
| GET | `/admin/support/tickets/{ticketId}` | Bearer from session | – |
| POST | `/admin/support/tickets/{ticketId}/assign` | Bearer from session | – |
| POST | `/admin/support/tickets/{ticketId}/close` | Bearer from session | – |
| GET | `/admin/support/tickets/{ticketId}/messages` | Bearer from session | – |
| POST | `/admin/support/tickets/{ticketId}/messages` | Bearer from session | required, from client |
| POST | `/admin/support/tickets/{ticketId}/read` | Bearer from session | – |
| POST | `/admin/support/tickets/{ticketId}/resolve` | Bearer from session | – |
| GET | `/admin/users` | Bearer from session | – |
| POST | `/admin/users/{userId}/reactivate` | Bearer from session | – |
| POST | `/admin/users/{userId}/resend-invite` | Bearer from session | – |
| POST | `/admin/users/{userId}/suspend` | Bearer from session | – |
| POST | `/auth/password/forgot` | none (public) | – |
| POST | `/auth/password/reset` | none (public) | – |
| GET | `/me/notification-preferences` | Bearer from session | – |
| PUT | `/me/notification-preferences` | Bearer from session | – |
| GET | `/me/notifications` | Bearer from session | – |
| POST | `/me/notifications/read-all` | Bearer from session | – |
| GET | `/me/notifications/unread-count` | Bearer from session | – |
| POST | `/me/notifications/{notificationId}/read` | Bearer from session | – |
| POST | `/me/push-subscriptions` | Bearer from session | – |
| POST | `/me/push-subscriptions/unregister` | Bearer from session | – |
| POST | `/media/uploads` | Bearer from session | – |
| POST | `/media/uploads/{mediaId}/complete` | Bearer from session | – |
| GET | `/media/{mediaId}` | Bearer from session | – |
| GET | `/push/config` | Bearer from session | – |

#### agent (24 operations)

| Method | Path | Session | Idempotency-Key |
|---|---|---|---|
| PATCH | `/agent/availability` | Bearer from session | – |
| GET | `/agent/finance/balances` | Bearer from session | – |
| GET | `/agent/finance/entries` | Bearer from session | – |
| GET | `/agent/finance/remittances` | Bearer from session | – |
| GET | `/agent/profile` | Bearer from session | – |
| GET | `/agent/shipments` | Bearer from session | – |
| GET | `/agent/shipments/{shipmentId}` | Bearer from session | – |
| POST | `/agent/shipments/{shipmentId}/delivered` | Bearer from session | required, from client |
| POST | `/agent/shipments/{shipmentId}/failed-attempt` | Bearer from session | required, from client |
| POST | `/agent/shipments/{shipmentId}/out-for-delivery` | Bearer from session | – |
| POST | `/agent/shipments/{shipmentId}/picked-up` | Bearer from session | – |
| POST | `/agent/shipments/{shipmentId}/returned` | Bearer from session | required, from client |
| POST | `/auth/password/forgot` | none (public) | – |
| POST | `/auth/password/reset` | none (public) | – |
| GET | `/governorates` | none (public) | – |
| GET | `/me/notification-preferences` | Bearer from session | – |
| PUT | `/me/notification-preferences` | Bearer from session | – |
| GET | `/me/notifications` | Bearer from session | – |
| POST | `/me/notifications/read-all` | Bearer from session | – |
| GET | `/me/notifications/unread-count` | Bearer from session | – |
| POST | `/me/notifications/{notificationId}/read` | Bearer from session | – |
| POST | `/me/push-subscriptions` | Bearer from session | – |
| POST | `/me/push-subscriptions/unregister` | Bearer from session | – |
| GET | `/push/config` | Bearer from session | – |

Operations reachable through no proxy: none besides the auth-route-only, webhook and health operations.

## 2. Query registry

Notation: key segments after the scope; `stale` = `staleTime`; `poll` = `refetchInterval` while visible. Defaults from `01` §6 apply where a cell is "default" (stale 30 s, refetch on focus). "Infinite" = cursor list via `infiniteListOptions`.

### 2.1 Shared public queries (`@nile/query`, scope `public`)

| Key | Endpoint | stale | Notes |
|---|---|---|---|
| `categories.tree` | `GET /categories` | 5 min | Server render: `revalidate: 300` |
| `categories.attributes(categoryId)` | `GET /categories/{categoryId}/attributes` | 5 min | `CATEGORY_NOT_FOUND` handled by callers |
| `governorates.list` | `GET /governorates` | 5 min | Checkout overrides to `stale 0` + refetch on mount (fees affect the total) |

### 2.2 Storefront (scope `storefront`)

| Key | Endpoint | stale / poll | Used by |
|---|---|---|---|
| `products.list(params)` | `GET /products` | 30 s, infinite | SF-01…SF-04 (first page server-rendered and hydrated) |
| `products.detail(idOrSlug)` | `GET /products/{idOrSlug}` | 0 | SF-05 (server-rendered, `no-store`) |
| `me.profile` | `GET /me` | 5 min | header island, SF-15 |
| `me.addresses` | `GET /me/addresses` | 1 min | SF-07, SF-16 |
| `cart` | `GET /cart` | 0, refetch on focus | header badge, SF-06, SF-07 |
| `orders.list(status[])` | `GET /orders` | default, infinite | SF-17 |
| `orders.detail(orderId)` | `GET /orders/{orderId}` | 0; poll 30 s while `pending_payment` (SF-18), 3 s on SF-09 until final or time limit | SF-08, SF-09, SF-18 |
| `orders.latestOpen` | `GET /orders?status[in]=pending_payment,placed&limit=1` | 0 | SF-09 fallback |

### 2.3 Seller (scope `seller`)

| Key | Endpoint | stale / poll | Used by |
|---|---|---|---|
| `profile` | `GET /seller/profile` | 1 min, refetch on focus | layout banner, SE-06, SE-07 |
| `overview.toConfirm` | `GET /seller/orders?status[eq]=placed&sort=createdAt&limit=5` | poll 60 s | SE-06 |
| `overview.returns` | `GET /seller/orders?status[eq]=returning_to_seller&sort=createdAt&limit=5` | poll 60 s | SE-06 |
| `products.list(filters)` | `GET /seller/products` | default, infinite | SE-08 |
| `products.detail(productId)` | `GET /seller/products/{productId}` | 0 | SE-10, SE-11, SE-12 (refetched when the stock dialog opens) |
| `stock.movements(variantId)` | `GET /seller/variants/{variantId}/stock-movements` | 0, infinite | SE-13 |
| `orders.list(tab)` | `GET /seller/orders` | infinite, poll 60 s | SE-14 |
| `orders.detail(sellerOrderId)` | `GET /seller/orders/{sellerOrderId}` | 0; poll 60 s while not terminal | SE-15 |
| `finance.balance` | `GET /seller/finance/balance` | default | SE-06, SE-16 |
| `finance.entries(filters)` | `GET /seller/finance/entries` | default, infinite | SE-16 |
| `finance.payouts(filters)` | `GET /seller/finance/payouts` | default, infinite | SE-16 |

### 2.4 Admin (scope `admin`)

| Key | Endpoint | stale / poll | Used by |
|---|---|---|---|
| `dashboard.<queue>` (5 queues) | sellers / shipments / refunds / accounts / orders lists with `limit=5` (spec 03 AD-02) | poll 60 s | AD-02 |
| `admins.list(status)` | `GET /admin/admins` | default, infinite | AD-03, actor lookup (all pages, 5 min) |
| `sellers.list(filters)` / `sellers.detail(id)` | `GET /admin/sellers` / `{sellerId}` | default / 0 | AD-04, AD-05; `sellers.byId` lookups 5 min |
| `settings.commission` | `GET /admin/settings/commission` | default | AD-06 |
| `categories.adminTree` | `GET /admin/categories` | 0 | AD-07 |
| `governorates.admin` | `GET /admin/governorates` | 5 min | AD-08, name lookups |
| `settings.delivery` | `GET /admin/settings/delivery` | default | AD-08 |
| `agents.list(filters)` / `agents.detail(id)` | `GET /admin/delivery-agents` / `{agentId}` | default / 0 | AD-09, AD-11, assign dialog; `agents.byId` lookups 5 min |
| `shipments.list(filters)` / `shipments.detail(id)` | `GET /admin/shipments` / `{shipmentId}` | default / 0 | AD-11, AD-12, AD-13, AD-15 |
| `orders.list(filters)` / `orders.detail(id)` | `GET /admin/orders` / `{orderId}` | default / 0 | AD-14, AD-15 |
| `orders.payment(orderId)` | `GET /admin/orders/{orderId}/payment` | 0 | AD-15 |
| `payments.detail(id)` | `GET /admin/payments/{paymentId}` | 0 | AD-17 |
| `refunds.list(filters)` | `GET /admin/payments/refunds` | 0, infinite | AD-16 |
| `finance.accounts(filters)` / `finance.account(id)` | `GET /admin/finance/accounts` / `{accountId}` | default / 0 | AD-11, AD-18, AD-19, AD-20, AD-21 (balances) |
| `finance.entries(accountId, filters)` | `GET /admin/finance/accounts/{accountId}/entries` | default, infinite | AD-19 |
| `finance.reference(type, id)` | `GET /admin/finance/entries` | 0 | AD-22 |
| `finance.remittances(filters)` | `GET /admin/finance/cod-remittances` | default, infinite | AD-20 |
| `finance.payouts(filters)` | `GET /admin/finance/payouts` | default, infinite | AD-21 |

### 2.5 Agent (scope `agent`)

| Key | Endpoint | stale / poll | Used by |
|---|---|---|---|
| `profile` | `GET /agent/profile` | 1 min, refetch on focus | layout, AG-02, AG-03 |
| `shipments.active(tab)` | `GET /agent/shipments?status[in]=…&sort=createdAt` | infinite, poll 30 s | AG-04 |
| `shipments.detail(id)` | `GET /agent/shipments/{shipmentId}` | 0, refetch on focus | AG-05 |
| `shipments.history(filters)` | `GET /agent/shipments?status[in]=delivered,returned_to_seller,cancelled&sort=-createdAt` | default, infinite | AG-06 |
| `finance.balances` | `GET /agent/finance/balances` | default | AG-07 |
| `finance.entries(account, filters)` | `GET /agent/finance/entries?account=fee\|cod` | default, infinite | AG-07 |
| `finance.remittances` | `GET /agent/finance/remittances` | default, infinite | AG-07 |

## 3. Mutation catalogue and cache effects

"set X" = `setQueryData` from the response; "inv X" = `invalidateQueries` (prefix match). "Idem" = through `useIdempotentMutation`.

### 3.1 Storefront

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Sign in / verify email | `/api/auth/login`, `/api/auth/verify-email` | – | remove all `storefront` queries, then navigate |
| Sign out | `/api/auth/logout` | – | remove all `storefront` queries; broadcast |
| Register, resend OTP, forgot, reset | `POST /auth/register/customer`, `/auth/email/resend-otp`, `/auth/password/forgot`, `/auth/password/reset` | – | none |
| Change password | `/api/auth/password-change` | – | none |
| Add to cart | `POST /cart/items` | – (no retry) | set `cart` |
| Change quantity | `PATCH /cart/items/{itemId}` | – | set `cart` |
| Remove line | `DELETE /cart/items/{itemId}` | – | inv `cart` |
| Empty cart | `DELETE /cart` | – | inv `cart` |
| Buy again | sequential `POST /cart/items` | – | inv `cart` once at the end |
| Place order | `POST /checkout` | yes | inv `cart`, `orders.list`; set `orders.detail(order.id)` |
| Pay now / session | `POST /orders/{orderId}/payment/kashier-session` | – | none (navigates away) |
| Cancel seller order | `POST /orders/{orderId}/seller-orders/{sellerOrderId}/cancel` | yes | set `orders.detail`; inv `orders.list` |
| Update profile | `PATCH /me` | – | set `me.profile` |
| Create / update / delete address | `POST /me/addresses`, `PATCH`, `DELETE /me/addresses/{addressId}` | – | inv `me.addresses` |
| Invite accept (landing) | `/api/auth/invite` | – | none |

### 3.2 Seller

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Update profile / re-apply | `PATCH /seller/profile`, `POST /seller/profile/reapply` | – | set `profile` |
| Create product | `POST /seller/products` | – | set `products.detail(id)`; inv `products.list` |
| Update / activate / deactivate product | `PATCH /seller/products/{id}`, `POST …/activate`, `…/deactivate` | – | set `products.detail`; inv `products.list` |
| Delete product | `DELETE /seller/products/{id}` | – | remove `products.detail`; inv `products.list` |
| Create / update / delete variant | `POST …/variants`, `PATCH`/`DELETE …/variants/{variantId}` | – | inv `products.detail(productId)`, `products.list` |
| Adjust stock | `POST /seller/variants/{variantId}/stock-adjustments` | yes | inv `products.detail(productId)`, `stock.movements(variantId)`, `products.list` (`inStock` follows asynchronously, `SPEC 06 CA-9`) |
| Accept / ready | `POST /seller/orders/{id}/accept`, `/ready` | – | set `orders.detail`; inv `orders.list`, `overview` |
| Cancel order / cancel items / return received | `POST …/cancel`, `…/items/{itemId}/cancel`, `…/return-received` | yes | set `orders.detail`; inv `orders.list`, `overview` |

### 3.3 Admin

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Invite admin / resend / suspend / reactivate | `POST /admin/admins`, `/admin/users/{userId}/resend-invite`, `/suspend`, `/reactivate` | – | inv `admins.list` |
| Seller decisions (approve, reject, suspend, reinstate) / commission | `POST /admin/sellers/{id}/…`, `PUT …/commission-rate` | – | set `sellers.detail`; inv `sellers.list`, `dashboard` |
| Default commission | `PUT /admin/settings/commission` | – | set `settings.commission` |
| Category / attribute / option create, update, delete | `/admin/categories…`, `/admin/attributes…`, `/admin/options…` | – | inv `categories.adminTree` |
| Governorate fee | `PATCH /admin/governorates/{id}` | – | inv `governorates.admin` |
| Agent share | `PUT /admin/settings/delivery` | – | set `settings.delivery` |
| Agent create / update / activate / deactivate | `POST /admin/delivery-agents`, `PATCH /{id}`, `POST …/activate`, `…/deactivate` | – | set `agents.detail`; inv `agents.list` |
| Assign shipment | `POST /admin/shipments/{id}/assign` | – | set `shipments.detail`; inv `shipments.list`, `agents.list`, `agents.detail`, `dashboard` |
| Record refund | `POST /admin/payments/refunds/{refundId}/record` | yes | inv `refunds.list`, `payments.detail`, `orders.payment`, `dashboard` |
| COD remittance | `POST /admin/finance/cod-remittances` | yes | inv `finance.remittances`, `finance.accounts`, `finance.account`, `agents.detail`, `dashboard` |
| Payout | `POST /admin/finance/payouts` | yes | inv `finance.payouts`, `finance.accounts`, `finance.account` |

### 3.4 Agent

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Shift on/off | `PATCH /agent/availability` | – | set `profile` |
| Picked up / start delivery | `POST /agent/shipments/{id}/picked-up`, `/out-for-delivery` | – | set `shipments.detail`; inv `shipments.active` |
| Delivered / failed attempt / handed back | `POST …/delivered`, `/failed-attempt`, `/returned` | yes | set `shipments.detail`; inv `shipments.active`, `shipments.history`, `profile`; inv `finance` on next visit (ledger is booked asynchronously by the backend worker [SPEC 12]) |

## 4. Asynchronous effects the UI must expect [SPEC]

| After | Updated later by the backend worker | UI rule |
|---|---|---|
| Stock adjustment | product `inStock` (projection, ~1 s) | Product list may show the old badge until the next fetch; no polling added |
| Seller suspended / reinstated | product visibility | Storefront 404s follow within seconds |
| Seller marks ready | shipment creation and auto-assignment | Admin "Unassigned" queue polls (60 s) |
| Delivered | ledger entries, balances | Finance screens refetch on visit; "Balances update a few moments after a delivery." note on AG-07/SE-16 [PROPOSED] |
| Card payment webhook | order `placed` | SF-09 polls |

---

## 5. Release 2 [v1.1 APPROVED 2026-10-23, T-J0]

Inputs: `api-inventory.md` §11, specs 00 §12, 01 §10, 02 §8, 03 §7, 04 §7, design 01 §15.

### 5.1 BFF allow-list additions per app

Merged into the §1 tables in T-J1 (2026-10-23) and checked against the pinned snapshot at backend `ecbcd19` by `allow-lists.test.ts` (operation exists, session, `Idempotency-Key`): storefront +38, seller +35, admin +51, agent +9 operations. Apps per operation: `/admin/*` admin; `/seller/*` seller; `/agent/*` agent; `/support/*` storefront and seller; `/me/notification*`, `/me/push-*`, `/push/*` all four apps; `/media/*` storefront, seller and admin (the agent app uploads nothing); the customer and public operations storefront. Not reachable through any proxy, as before: the auth routes (the new `POST /api/auth/realtime-token` is an auth action, design 01 §15.2).

The R1 user actions (`/admin/users/{userId}/suspend`, `/reactivate`, `/resend-invite`) are already on the admin allow-list; AD-24 starts using them for customers and agents (AD-Q-10).

### 5.2 Query registry additions

Notation as §2. "Live" names the realtime messages that invalidate the key (§5.3); without a socket the listed polling applies.

#### Shared (`@nile/notifications`, `@nile/support-screens`, `@nile/media`; scope = the app's)

| Key | Endpoint | stale / poll | Live |
|---|---|---|---|
| `notifications.unreadCount` | `GET /me/notifications/unread-count` | 0; poll 60 s without socket | `notification.created` |
| `notifications.list(filter)` | `GET /me/notifications` | 0, infinite | `notification.created` |
| `notifications.latest` | `GET /me/notifications?limit=10` (the bell panel, T-J6) | 0 | `notification.created` |
| `notifications.preferences` | `GET /me/notification-preferences` | 5 min | – |
| `push.config` | `GET /push/config` | Infinity (per session) | – |
| `media.detail(mediaId)` | `GET /media/{mediaId}` | not cached: `waitForMedia` reads it directly (T-J4) | `media.updated` wakes the wait |
| `support.list(filter)` | `GET /support/tickets` (admin: `/admin/support/tickets`) | 0, infinite | `support.ticket_updated`, `support.message_created` |
| `support.detail(ticketId)` | `GET /support/tickets/{id}` (admin variant) | 0 | `support.ticket_updated` (that id) |
| `support.messages(ticketId)` | `GET …/{id}/messages` | 0, infinite (newest first, reversed in the view) | `support.message_created` (that id); poll 10 s without socket while open |

#### Storefront (scope `storefront`)

| Key | Endpoint | stale | Used by | Live |
|---|---|---|---|---|
| `sellers.public(sellerId)` | `GET /sellers/{sellerId}` | 5 min (server `revalidate: 300`) | SF-22 | – |
| `reviews.summary(productId)` | `GET /products/{id}/reviews/summary` | 5 min | SF-05 | – |
| `reviews.list(productId, params)` | `GET /products/{id}/reviews` | 1 min, infinite | SF-05 | – |
| `wishlist.ids` | `GET /me/wishlist/product-ids` | 5 min (session-wide) | hearts | – |
| `wishlist.list` | `GET /me/wishlist` | 0, infinite | SF-23 | – |
| `myReviews.reviewable` | `GET /me/reviewable-items` | 1 min, infinite | SF-18, SF-24, SF-25 | `seller_order.updated` (delivered) |
| `myReviews.list` / `.detail(id)` | `GET /me/reviews`, `/me/reviews/{id}` | default | SF-24, SF-25 | – |
| `coupon.preview(code, cartVersion)` | `POST /cart/coupon-preview` (read-like `POST`, called through `useQuery` with `retry: false`) | 0 | SF-07 | – |
| `returns.returnable(orderId, sellerOrderId)` | `GET /orders/{o}/seller-orders/{so}/returnable-items` | 0 | SF-26 | – |
| `returns.list(status[])` / `.detail(id)` | `GET /returns`, `/returns/{id}` | default | SF-27, SF-28 | `return.updated` |
| `orders.detail(orderId)` (R1 key) | – | – | SF-18 | `order.updated`, `seller_order.updated`, `shipment.updated`, `payment.updated`, `return.updated` (that order) |

#### Seller (scope `seller`)

| Key | Endpoint | stale | Used by | Live |
|---|---|---|---|---|
| `returns.list(tab)` / `.detail(id)` | `GET /seller/returns`, `/seller/returns/{id}` | default | SE-06, SE-18, SE-19 | `return.updated` |
| `reviews.list(params)` | `GET /seller/reviews` | default, infinite | SE-20 | `notification.created` of type `review_received` [PROPOSED] |
| `coupons.list(status)` / `.detail(id)` | `GET /seller/coupons`, `/seller/coupons/{id}` | default | SE-21…SE-23 | – |
| `finance.holds` | `GET /seller/finance/holds` | 0 (read on every visit, DQ-9) | SE-16 | – |
| `orders.*` (R1 keys) | – | – | SE-06, SE-14, SE-15 | `seller_order.placed`, `seller_order.updated` |

#### Admin (scope `admin`)

| Key | Endpoint | stale | Used by | Live |
|---|---|---|---|---|
| `dashboard` | `GET /admin/dashboard` | 60 s (matches the server cache) | AD-02 | – |
| `users.list(params)` | `GET /admin/users` | default, infinite | AD-24 | – |
| `customers.list(params)` / `.detail(id)` | `GET /admin/customers*` | default | AD-25, AD-26 | – |
| `products.detail(id)` | `GET /admin/products/{id}` | 0 | AD-27 | – |
| `reviews.list(params)` / `.detail(id)` | `GET /admin/reviews*` | default | AD-30, AD-31 | – |
| `returns.list(params)` / `.detail(id)` | `GET /admin/returns*` | default | AD-02, AD-32, AD-33 | `return.updated` (escalated, disputed) |
| `refunds.detail(id)` | `GET /admin/payments/refunds/{id}` | 0, `gcTime` 0 (holds COD payout details: never kept after leaving AD-34) | AD-34 | – |
| `coupons.list(params)` / `.detail(id)` | `GET /admin/coupons*` | default | AD-35…AD-37 | – |
| `audit.list(params)` / `.detail(id)` | `GET /admin/audit-log*` | default | AD-38, AD-39 | – |

#### Agent (scope `agent`)
R1 shipment keys gain the `kind` parameter; live: `shipment.assigned`, `shipment.unassigned`, `shipment.updated`; the 30 s polling only without a socket.

### 5.3 Realtime invalidation map (per app, `@nile/realtime` `invalidationMap`)

| Message | storefront | seller | admin | agent |
|---|---|---|---|---|
| `order.updated` | `orders.list`, `orders.detail(orderId)` | – | – | – |
| `seller_order.placed` | – | `orders.list` | – | – |
| `seller_order.updated` | `orders.detail(orderId)`, `orders.list`, `myReviews.reviewable` | `orders.list`, `orders.detail(sellerOrderId)` | – | – |
| `shipment.updated` | `orders.detail(orderId)` | – | – | `shipments.list`, `shipments.detail(shipmentId)` |
| `shipment.assigned` / `shipment.unassigned` | – | – | – | `shipments.list`, `shipments.detail(shipmentId)`, `profile` (active count) |
| `payment.updated` | `orders.detail(orderId)`, `orders.list` | – | – | – |
| `return.updated` | `returns.list`, `returns.detail(returnId)`, `orders.detail(orderId)` | `returns.list`, `returns.detail(returnId)`, `orders.detail(sellerOrderId)`, `finance.*` | `returns.list`, `returns.detail(returnId)` | – |
| `media.updated` | none: wakes `waitForMedia` through its `subscribe` option (T-J4) | same | same | – |
| `support.ticket_updated` | `support.list`, `support.detail(ticketId)` | same | same + `dashboard` | – |
| `support.message_created` | `support.messages(ticketId)`, `support.list` | same | same | – |
| `notification.created` | `notifications.*` | `notifications.*` | `notifications.*` | `notifications.*` |
| `session.ended` | handled by the connection (design 01 §15.3), no invalidation | | | |
| after any (re)connect | every active query of the scope | same | same | same |

### 5.4 Mutation catalogue additions

#### Shared

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Request upload / complete | `POST /media/uploads`, `/media/uploads/{id}/complete` | – (never auto-retried after a definite answer) | none (tile state) |
| Mark notification read / all read | `POST /me/notifications/{id}/read`, `/read-all` | – | set `notifications.list` item / all `read: true`; inv `notifications.unreadCount` |
| Save preferences | `PUT /me/notification-preferences` (changed categories only) | – | set `notifications.preferences` |
| Register / unregister push | `POST /me/push-subscriptions`, `/unregister` | – | none |
| Open ticket | `POST /support/tickets` | Idem | inv `support.list`; navigate to the thread |
| Post message (user / admin) | `POST …/tickets/{id}/messages` | Idem (one key per message intent) | append to `support.messages(id)`; inv `support.detail(id)`, `support.list` |
| Mark ticket read | `POST …/tickets/{id}/read` | – | inv `support.list` (unread mark) |

#### Storefront

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Wishlist add / remove | `PUT` / `DELETE /me/wishlist/{productId}` | – (idempotent; retried once on network failure) | optimistic `wishlist.ids`; inv `wishlist.list` |
| Write review | `POST /reviews` | – (unique rule) | inv `myReviews.*`, `reviews.*(productId)` |
| Edit / delete review | `PATCH` / `DELETE /me/reviews/{id}` | – | set / remove `myReviews.detail(id)`; inv `myReviews.list`, `myReviews.reviewable`, `reviews.*(productId)` |
| Checkout (R1) | `POST /checkout` + `couponCode` | Idem (new key when the coupon or total changes) | as R1 |
| Request return | `POST /returns` | Idem | set `returns.detail(id)`; inv `returns.list`, `returns.returnable(…)`, `orders.detail(orderId)` |
| Cancel / escalate return | `POST /returns/{id}/cancel`, `/escalate` | – (state-guarded) | set `returns.detail(id)`; inv `returns.list` |

#### Seller

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Add / edit / reorder / remove image | `POST`, `PATCH`, `PUT …/order`, `DELETE /seller/products/{id}/images*` | – | set the images of `products.detail(id)` from the response (add, reorder); inv `products.detail(id)`, `products.list` (edit, remove) |
| Approve / reject return | `POST /seller/returns/{id}/approve`, `/reject` | – | inv `returns.detail(id)`, `returns.list`, `overview` |
| Confirm receipt | `POST …/confirm-receipt` | Idem | inv `returns.*`, `finance.*`, `products.*` (restocked) |
| Dispute | `POST …/dispute` | – | inv `returns.*` |
| Reply to review | `POST /seller/reviews/{id}/reply` | – | replace the row in `reviews.list` |
| Create / edit coupon | `POST /seller/coupons`, `PATCH …/{id}` | – | set `coupons.detail(id)`; inv `coupons.list` |

#### Admin

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Cancel seller order / order | `POST /admin/seller-orders/{id}/cancel`, `/admin/orders/{id}/cancel` | Idem | set `orders.detail(orderId)`; inv `orders.list`, `shipments.*`, `refunds.*` |
| Block / unblock product | `POST /admin/products/{id}/block`, `/unblock` | – | set `products.detail(id)` |
| Category image set / remove | `PUT` / `DELETE /admin/categories/{id}/image` | – | inv `categories.adminTree` |
| Assign / resolve / close ticket | `POST /admin/support/tickets/{id}/assign`, `/resolve`, `/close` | – | set `support.detail(id)`; inv `support.list` |
| Hide / show review or reply | `POST /admin/reviews/{id}/hide`, `/unhide`, `/reply/hide`, `/reply/unhide` | – | set `reviews.detail(id)`; inv `reviews.list` |
| Decide return / resolve dispute | `POST /admin/returns/{id}/decide`, `/resolve-dispute` | – / Idem | inv `returns.*`, `dashboard` |
| Record / retry refund | `POST /admin/payments/refunds/{id}/record`, `/retry` | Idem / – | set `refunds.detail(id)`; inv `refunds.list`, `payments.*`, `orders.detail` |
| Create / edit / block / unblock coupon | `POST /admin/coupons`, `PATCH`, `/block`, `/unblock` | – | set `coupons.detail(id)`; inv `coupons.list` |
| Suspend / reactivate customer, resend invite | R1 user endpoints | – | inv `users.list`, `customers.*` |

#### Agent

| Mutation | Endpoint | Idem | Cache effect |
|---|---|---|---|
| Return pickup: picked up / failed attempt / handed to the seller | `POST /agent/shipments/{id}/picked-up`, `/failed-attempt`, `/delivered` (empty body) | – / Idem / Idem (as R1) | set `shipments.detail(id)`; inv `shipments.list`, `profile` |

### 5.5 Asynchronous effects the UI must expect (Release 2) [SPEC]

| After | Updated later by the backend worker | UI rule |
|---|---|---|
| Upload completed | image processed (`ready` / `failed`, 1–3 s) | `waitForMedia` (socket or polling, design 01 §15.4) |
| Review created / edited / hidden | product and seller rating projections | Ratings on cards may lag a few seconds; no polling |
| Return approved | return shipment created and auto-assigned | Return detail shows "Approved" until `return.updated` |
| Return completed | refund created; Kashier refund job (minutes, retries); ledger bookings | Return / order show the refund status as the API gives it; finance screens read on visit |
| Seller order delivered | hold row; release after 14 days (job) | SE-16 "On hold" reads on visit |
| Admin cancel | Kashier refund flagged and sent automatically | AD-15 refunds block refetched after the cancel; later states arrive by refetch |
| Push notification | sent by the worker after the in-app row | The bell (in-app) is the source of truth |
| Dashboard | cached 60 s server-side | "Figures from {generatedAt}" |
