# Design 02 — Data layer: BFF allow-lists, queries, mutations

Status: **v1.0 APPROVED (2026-10-14).** Approved by the user with every recommendation in `01-system-design.md` §14 (DQ-1…DQ-9). Companion of `01-system-design.md`.
Generated parts (§1) come from the OpenAPI snapshot (sha256 prefix `4b4e399d39b9b3da`, backend `4ad89a6`) and are regenerated with the snapshot; the BFF code reads the same data from `packages/api/src/allow-lists.ts`, which a unit test compares against this table.

---

## 1. BFF allow-lists per app [VERIFIED against OpenAPI, generated]

Not reachable through any proxy, by design: `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/email/verify`, `/auth/invite/accept`, `/auth/password/change` (dedicated auth routes, `01` §4.1), `POST /webhooks/kashier`, `GET /health/*`.

#### storefront (26 operations)

| Method | Path | Session | Idempotency-Key |
|---|---|---|---|
| POST | `/auth/email/resend-otp` | none (public) | – |
| POST | `/auth/password/forgot` | none (public) | – |
| POST | `/auth/password/reset` | none (public) | – |
| POST | `/auth/register/customer` | none (public) | – |
| GET | `/cart` | Bearer from session | – |
| DELETE | `/cart` | Bearer from session | – |
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
| GET | `/orders` | Bearer from session | – |
| GET | `/orders/{orderId}` | Bearer from session | – |
| POST | `/orders/{orderId}/payment/kashier-session` | Bearer from session | – |
| POST | `/orders/{orderId}/seller-orders/{sellerOrderId}/cancel` | Bearer from session | required, from client |
| GET | `/products` | none (public) | – |
| GET | `/products/{idOrSlug}` | none (public) | – |

#### seller (32 operations)

| Method | Path | Session | Idempotency-Key |
|---|---|---|---|
| POST | `/auth/email/resend-otp` | none (public) | – |
| POST | `/auth/password/forgot` | none (public) | – |
| POST | `/auth/password/reset` | none (public) | – |
| POST | `/auth/register/seller` | none (public) | – |
| GET | `/categories` | none (public) | – |
| GET | `/categories/{categoryId}/attributes` | none (public) | – |
| GET | `/governorates` | none (public) | – |
| GET | `/seller/finance/balance` | Bearer from session | – |
| GET | `/seller/finance/entries` | Bearer from session | – |
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
| POST | `/seller/products/{productId}/variants` | Bearer from session | – |
| PATCH | `/seller/products/{productId}/variants/{variantId}` | Bearer from session | – |
| DELETE | `/seller/products/{productId}/variants/{variantId}` | Bearer from session | – |
| GET | `/seller/profile` | Bearer from session | – |
| PATCH | `/seller/profile` | Bearer from session | – |
| POST | `/seller/profile/reapply` | Bearer from session | – |
| POST | `/seller/variants/{variantId}/stock-adjustments` | Bearer from session | required, from client |
| GET | `/seller/variants/{variantId}/stock-movements` | Bearer from session | – |

#### admin (52 operations)

| Method | Path | Session | Idempotency-Key |
|---|---|---|---|
| POST | `/admin/admins` | Bearer from session | – |
| GET | `/admin/admins` | Bearer from session | – |
| PATCH | `/admin/attributes/{attributeId}` | Bearer from session | – |
| DELETE | `/admin/attributes/{attributeId}` | Bearer from session | – |
| POST | `/admin/attributes/{attributeId}/options` | Bearer from session | – |
| GET | `/admin/categories` | Bearer from session | – |
| POST | `/admin/categories` | Bearer from session | – |
| PATCH | `/admin/categories/{categoryId}` | Bearer from session | – |
| POST | `/admin/categories/{categoryId}/attributes` | Bearer from session | – |
| POST | `/admin/delivery-agents` | Bearer from session | – |
| GET | `/admin/delivery-agents` | Bearer from session | – |
| GET | `/admin/delivery-agents/{agentId}` | Bearer from session | – |
| PATCH | `/admin/delivery-agents/{agentId}` | Bearer from session | – |
| POST | `/admin/delivery-agents/{agentId}/activate` | Bearer from session | – |
| POST | `/admin/delivery-agents/{agentId}/deactivate` | Bearer from session | – |
| GET | `/admin/finance/accounts` | Bearer from session | – |
| GET | `/admin/finance/accounts/{accountId}` | Bearer from session | – |
| GET | `/admin/finance/accounts/{accountId}/entries` | Bearer from session | – |
| POST | `/admin/finance/cod-remittances` | Bearer from session | required, from client |
| GET | `/admin/finance/cod-remittances` | Bearer from session | – |
| GET | `/admin/finance/entries` | Bearer from session | – |
| POST | `/admin/finance/payouts` | Bearer from session | required, from client |
| GET | `/admin/finance/payouts` | Bearer from session | – |
| GET | `/admin/governorates` | Bearer from session | – |
| PATCH | `/admin/governorates/{governorateId}` | Bearer from session | – |
| PATCH | `/admin/options/{optionId}` | Bearer from session | – |
| DELETE | `/admin/options/{optionId}` | Bearer from session | – |
| GET | `/admin/orders` | Bearer from session | – |
| GET | `/admin/orders/{orderId}` | Bearer from session | – |
| GET | `/admin/orders/{orderId}/payment` | Bearer from session | – |
| GET | `/admin/payments/{paymentId}` | Bearer from session | – |
| GET | `/admin/payments/refunds` | Bearer from session | – |
| POST | `/admin/payments/refunds/{refundId}/record` | Bearer from session | required, from client |
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
| POST | `/admin/users/{userId}/reactivate` | Bearer from session | – |
| POST | `/admin/users/{userId}/resend-invite` | Bearer from session | – |
| POST | `/admin/users/{userId}/suspend` | Bearer from session | – |
| POST | `/auth/password/forgot` | none (public) | – |
| POST | `/auth/password/reset` | none (public) | – |

#### agent (15 operations)

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
