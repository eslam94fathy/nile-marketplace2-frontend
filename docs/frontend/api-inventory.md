# API Inventory — Nile Marketplace (frontend view)

Status: **DRAFT v0.2 (2026-10-14), for review.** v0.2: recommendations for the backend-side questions (§10.4); OQ-3 resolved without a backend change. **§11 (2026-10-23, T-J0): Release 2 additions against backend `ecbcd19`.**
Backend: `nile-marketplace2` @ `4ad89a6` (`main`, clean working tree), read locally at `C:\Eslam\nile-marketplace2`, remote `github.com/eslam94fathy/nile-marketplace2`.

## 0. How this was produced, and how to read it

Sources, in order of authority for this document:

1. **The running API.** The OpenAPI 3.1 document was fetched from `GET /api/v1/docs/openapi.json` (sha256 prefix `4b4e399d39b9b3da` of the served bytes, 123 operations, 150 schemas). Since T-B3 it is pinned as `packages/api/openapi/nile.openapi.json` (pretty-printed, sha256 in `backend.lock.json`; same content, verified). Public endpoints were called to confirm runtime shapes (envelope, `null` values, error body, CORS preflight).
2. **Backend source** (`src/http-app.ts`, `src/app/*/routes.ts`, `src/lib/middleware/*`, `src/lib/http/openapi/*`, env schema) for things OpenAPI doesn't carry: role guards, rate-limit classes, headers, CORS.
3. **Backend spec** (`docs/spec/00`–`13`, all APPROVED) and `CLAUDE.md` for business rules and error codes.

Cross-check: the Express routers register **123** routes and the OpenAPI document has **123** operations; the registry throws on a duplicate. Nothing undocumented was found.

Labels used in all four frontend documents:

| Label | Meaning |
|---|---|
| **[VERIFIED]** | Seen in the running API, its OpenAPI document, or backend source code |
| **[SPEC]** | Stated in an approved backend spec, not separately exercised at runtime |
| **[ASSUMPTION]** | My inference. Not to be built on until confirmed |
| **[OPEN]** | Unresolved question. Listed with an id in §9 |

> Environment note [VERIFIED]: on this Windows machine host port 3000 sits inside a Hyper-V/WinNAT excluded range (2978–3077), so the `api` container from `docker compose up` cannot bind it. For discovery the same image was run temporarily on host port 3100 (`docker compose run --no-deps -p 3100:3000 api`); no backend file was changed. Port 3000 is also the backend's `INVITE_URL_BASE` host in `.env` (`http://localhost:3000/invite`). See OQ-14.

## 1. Transport and envelope [VERIFIED]

- Base URL: `/api/v1`. JSON only. Health probes live outside it (`/health/live`, `/health/ready`).
- Success: `{ "success": true, "data": <T>, "meta"?: { "nextCursor": string|null, "hasMore": boolean, "limit": number } }`. `meta` only on paginated lists.
- Error: `{ "success": false, "error": { "code": string, "message": string, "details"?: ErrorDetail[] }, "correlationId": string|null }`.
  - `ErrorDetail = { field: string, constraint: string, message: string, value?: string }`.
  - Validation: `details[].field` is a dotted path such as `pickupAddress.city` or `variants[0].price` [SPEC 01 §2].
  - Domain errors naming entities put the id in `details[].value` (e.g. `INSUFFICIENT_STOCK` → `{ field: 'variantId', value: <uuid>, constraint: 'available', message: 'available: <n>' }`; `ORDER_PAYMENT_PENDING` → the pending order id in `details[0].value`) [SPEC 08, 09].
- `204` responses have no body.
- Every response carries `X-Correlation-Id`. A client may send its own (must be a UUID) and it is echoed [VERIFIED].
- Strict request DTOs: **unknown body keys → `400 VALIDATION_FAILED`** (`forbidNonWhitelisted`). `null` on an optional field is rejected unless the field is documented nullable. A PATCH body must contain at least one field. The frontend must therefore send exactly the documented fields, never a whole form model [SPEC 01 §1.1].
- Money: decimal **strings**, EGP, 2 decimals (`"150.00"`), pattern `^\d{1,10}(\.\d{1,2})?$`. Rates are strings with up to 4 decimals (`"0.1000"` = 10 %). No currency field anywhere.
- Timestamps: ISO-8601 UTC strings. Ids: UUID v7 strings.
- Phone numbers: Egyptian mobile E.164 only, `^\+20(10|11|12|15)\d{8}$`.
- No ETag/conditional request contract. Express adds weak ETags by default; nothing relies on them.

## 2. Authentication, session and authorization

### 2.1 Tokens [VERIFIED + SPEC 03]

| Item | Value |
|---|---|
| Access token | RS256 JWT with `kid`; claims `sub` (user id), `role`, `iss`, `aud`, `iat`, `exp`. No PII, no profile ids |
| Access TTL | 15 min (`ACCESS_TOKEN_TTL_MINUTES`, env) |
| Refresh token | Opaque, 43 chars (base64url of 32 bytes), stored hashed server-side |
| Refresh TTL | 30 days (`REFRESH_TOKEN_TTL_DAYS`) |
| Transport | `Authorization: Bearer <access>`; refresh token **in the JSON body** of `/auth/refresh`, `/auth/logout`, `/auth/password/change` |
| Cookies | **None.** The backend sets and reads no cookies (CLAUDE.md §10: "No auth cookies (so no CSRF surface)") |
| Public key endpoint | **None** (no JWKS). Keys are env-only (`JWT_PUBLIC_KEYS`, a JSON record keyed by `kid`) |

`AuthTokensDto` (returned by login, verify-email, accept-invite, refresh):
`{ accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, user: { id, email, role, status } }`.

### 2.2 Refresh rotation — the rule that shapes the web auth design [SPEC 03 UC-ID-4]

- Every refresh **rotates**: the presented token is revoked and a new one issued in the same family.
- Presenting an already-revoked token is treated as **reuse → the whole family is revoked** (the user is logged out on that device).
- Two concurrent refreshes with the same token: the loser is treated as reuse → family revoked.
- **No grace window in R1.** The spec says "the mobile app must serialise refresh calls". A browser with several tabs, or a server render racing a client fetch, will hit this unless refresh is strictly serialised per session (architecture.md §5).
- A user who is no longer `active` cannot refresh (`INVALID_REFRESH_TOKEN`).
- Suspension also blocks already-issued access tokens at once via a Redis deny entry (fails open if Redis is down) [SPEC 03 I-11].

### 2.3 Session lifecycle endpoints

| Flow | Endpoint | Notes |
|---|---|---|
| Login | `POST /auth/login` `{ email, password, deviceName? }` | `deviceName` (1..100) is stored for session auditing. Errors `INVALID_CREDENTIALS` 401, `EMAIL_NOT_VERIFIED` 403, `ACCOUNT_SUSPENDED` 403 (the last two only after a correct password) |
| Refresh | `POST /auth/refresh` `{ refreshToken }` | `INVALID_REFRESH_TOKEN` 401 → session is over, go to login |
| Logout (this device) | `POST /auth/logout` `{ refreshToken }` | Always 204, even for unknown tokens. No access token needed |
| Logout everywhere | – | **No endpoint.** Only side effect of password change/reset (OQ-9) |
| Change password | `POST /auth/password/change` `{ currentPassword, newPassword, refreshToken }` | Any role. Keeps the caller's session, revokes all others |
| Register customer | `POST /auth/register/customer` | No tokens. Returns `{ userId, email, status: 'pending_email_verification' }`; an OTP is emailed |
| Register seller | `POST /auth/register/seller` | No tokens. Seller then needs email verification **and** admin approval |
| Verify email | `POST /auth/email/verify` `{ email, otp }` | Logs the user in (returns tokens) |
| Resend OTP | `POST /auth/email/resend-otp` `{ email }` | Always 200 with the same generic message (no enumeration). 60 s cooldown server-side, silent |
| Forgot / reset | `POST /auth/password/forgot` → `POST /auth/password/reset` `{ email, otp, newPassword }` | Reset revokes every session; user logs in again |
| Accept invite | `POST /auth/invite/accept` `{ token, password }` | Admins and delivery agents only. Token comes from the emailed link `INVITE_URL_BASE?token=<43 chars>` [VERIFIED `identity/constants.ts`] |

OTP rules [SPEC 03, env]: 6 digits, valid 10 min, 5 attempts, then `INVALID_OTP` regardless. Invite link valid 72 h.
Password rules: min 8 chars, max 72 **UTF-8 bytes**, never trimmed, no composition rules. Login accepts any non-empty password up to 72 bytes.

### 2.4 Roles and guards [VERIFIED routes.ts]

`UserRole`: `customer | seller | admin | delivery_agent`. **One role per account.**

| Path prefix | Guard |
|---|---|
| `/auth/*` (except `password/change`) | public |
| `/auth/password/change` | any authenticated role |
| `/me*`, `/cart*`, `/checkout`, `/orders*` | `customer` |
| `/seller/*` | `seller` |
| `/agent/*` | `delivery_agent` |
| `/admin/*` | `admin` |
| `/categories*`, `/products*`, `/governorates` | public |

- Wrong role → `403 FORBIDDEN`. Missing/expired/invalid token → `401 UNAUTHENTICATED`.
- **Ownership failures return `404`**, never `403` (IDOR-safe). The UI must treat "not found" on owned resources as "not yours or gone".
- Business-status guards on top of role [SPEC]:
  - Seller catalog **writes** need seller status `approved` → `403 SELLER_NOT_APPROVED`. Reads work in any status. Seller order handling and finance work in any status (suspended sellers finish open orders).
  - Agent endpoints except `GET /agent/profile` need agent status `active` → `403 AGENT_INACTIVE`.
  - A deactivated agent's login is suspended (cannot log in at all).
- Status visible after login: `user.status` in `AuthTokensDto` (`pending_email_verification | invited | active | suspended`); seller business status via `GET /seller/profile` (`pending_approval | approved | rejected | suspended`); agent status via `GET /agent/profile` (`active | inactive`).
- **"Who am I" per role:** customer `GET /me`, seller `GET /seller/profile`, agent `GET /agent/profile`, admin **none** (OQ-8).

## 3. Lists: pagination, filters, sorting [VERIFIED + SPEC 01 §5]

- **Cursor (keyset) pagination only.** `?limit=&cursor=&sort=`. `limit` default 20, max 100 (env); `limit=0` or a bad value → `400` [VERIFIED]. `cursor` is opaque; it is bound to the sort (a cursor from another sort → `400 INVALID_CURSOR`).
- `meta = { nextCursor, hasMore, limit }`. **No total count, no previous cursor, no page numbers.** UI implications: "Load more"/infinite lists, or a client-side cursor stack for Back; no "page 3 of 12", no result counts.
- Filters: `field[op]=value`, ops from `eq, ne, gt, gte, lt, lte, in, like`, **per-endpoint whitelist** (unknown field/op → `400 INVALID_QUERY`). `in` takes comma-separated values. Dates are ISO strings.
- Sort: `sort=field` (ascending) or `sort=-field` (descending), per-endpoint whitelist; tie-broken on id server-side.
- The whitelist per endpoint is in the "Query" column of §6 and in each operation's OpenAPI summary.
- Express is configured with the **simple** query parser, so `a[gte]` stays a literal key; the client must serialise filter keys literally (`createdAt%5Bgte%5D=…` is fine; nested objects are not).
- Unpaginated arrays: categories (tree), governorates (27), my addresses (≤ 20), cart, admin category tree, admin governorates, `GET /admin/finance/entries` (≤ 6 per reference).

Catalog specifics (`GET /products`) [SPEC 06]:
- `q`: 2..100 chars, full-text + typo-tolerant word similarity. Default sort `-relevance` with `q`, else `-publishedAt`; `sort=relevance` without `q` → 400. Other sort: `minPrice`, `publishedAt`.
- `categoryId[eq]` includes descendants. `price[gte|lte]` filters on the product's lowest variant price.
- `attr.<code>[in]=opt1,opt2`: needs `categoryId`; max 5 `attr.*` filters, max 20 values each; all conditions must hold on the **same** variant; unknown attribute/option code → 400. Attribute and option codes come from `GET /categories/:id/attributes`.

## 4. Idempotency [VERIFIED middleware + SPEC 01 §4]

Endpoints marked **required** in §6 reject a request without `Idempotency-Key` (`400 IDEMPOTENCY_KEY_REQUIRED`).
- Key: any UUID. Scope: user + key. The server fingerprints method + route template + canonical body.
- Same key, still running → `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`. Same key, finished → **replay** of the stored status + body, header `Idempotent-Replayed: true`. Same key, different body → `422 IDEMPOTENCY_KEY_REUSED`. `5xx` is not stored (retry with the same key is safe). TTL 24 h (env).
- Frontend rule: **one key per user intent**, generated when the action starts and reused for every retry of that same action (network error, 5xx, 409-in-progress); a new key only for a new intent. Never one key per HTTP attempt.
- Endpoints that require it (12): checkout, customer seller-order cancel, seller order cancel / item cancel / return-received, stock adjustment, agent delivered / failed-attempt / returned, admin refund record, COD remittance, payout.

## 5. Rate limits [VERIFIED rate-limit.ts, `.env` dev values]

| Class | Key | Dev value | Applies to |
|---|---|---|---|
| `general` | **client IP** | 600 / 60 s | every `/api/v1` request (global middleware) |
| `strict-auth` | IP **and** hashed email (two counters) | 10 / 300 s | register ×2, login, verify, resend OTP, forgot, reset, invite accept; change-password (IP + account email) |
| `refresh` | IP | 30 / 300 s | refresh, logout |
| `checkout` | user id | 10 / 60 s | checkout, kashier-session |

- Over the limit → `429 RATE_LIMITED` + `Retry-After` header. Strict-auth, refresh and checkout **fail closed** (`503 SERVICE_UNAVAILABLE`) if Redis is down.
- The client IP is `req.ip` with `trust proxy = TRUST_PROXY_HOPS` (0 locally). **Any server-side caller (a Next.js server, BFF or SSR render) is seen as one IP for all its users.** This is the main integration risk for a web client: architecture.md §5.4 and OQ-1.

## 6. Endpoint catalogue [VERIFIED, generated from the OpenAPI document]

"Documented errors" are parsed from each operation's summary; the OpenAPI document has no per-status error schemas (only a `default` `ErrorEnvelope`). Status codes for each error are in §7. Body/response schema names are the OpenAPI component names; full field lists are in the OpenAPI document and the backend specs.

### Auth & identity (public + self-service)

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| POST | `/auth/email/resend-otp` | public | `EmailOnlyDto` | – | – | 200 `MessageDto` | – |
| POST | `/auth/email/verify` | public | `VerifyEmailDto` | – | – | 200 `AuthTokensDto` | INVALID_OTP |
| POST | `/auth/invite/accept` | public | `AcceptInviteDto` | – | – | 200 `AuthTokensDto` | INVALID_INVITE_TOKEN |
| POST | `/auth/login` | public | `LoginDto` | – | – | 200 `AuthTokensDto` | INVALID_CREDENTIALS, EMAIL_NOT_VERIFIED, ACCOUNT_SUSPENDED |
| POST | `/auth/logout` | public | `RefreshTokenDto` | – | – | 204 | – |
| POST | `/auth/password/change` | any role | `ChangePasswordDto` | – | – | 204 | INVALID_CURRENT_PASSWORD, PASSWORD_UNCHANGED, INVALID_REFRESH_TOKEN |
| POST | `/auth/password/forgot` | public | `EmailOnlyDto` | – | – | 200 `MessageDto` | – |
| POST | `/auth/password/reset` | public | `ResetPasswordDto` | – | – | 204 | INVALID_OTP |
| POST | `/auth/refresh` | public | `RefreshTokenDto` | – | – | 200 `AuthTokensDto` | INVALID_REFRESH_TOKEN |
| POST | `/auth/register/customer` | public | `RegisterCustomerDto` | – | – | 201 `RegisteredCustomerDto` | EMAIL_ALREADY_REGISTERED |
| POST | `/auth/register/seller` | public | `RegisterSellerDto` | – | – | 201 `RegisteredSellerDto` | EMAIL_ALREADY_REGISTERED, BUSINESS_NAME_TAKEN, GOVERNORATE_NOT_FOUND |

### Reference data (public)

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/governorates` | public | – | – | – | 200 `GovernorateDto[]` | – |

### Catalog (public)

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/categories` | public | – | – | – | 200 `CategoryNodeDto[]` | – |
| GET | `/categories/{categoryId}/attributes` | public | – | – | – | 200 `EffectiveAttributeDto[]` | CATEGORY_NOT_FOUND |
| GET | `/products` | public | – | `q` `limit` `cursor` `sort` `categoryId[eq]` `price[gte]` `price[lte]` `inStock[eq]` `sellerId[eq]` `attr.{code}[in]` | – | 200 `ProductListItemDto[]` + page | – |
| GET | `/products/{idOrSlug}` | public | – | – | – | 200 `ProductDetailDto` | PRODUCT_NOT_FOUND |

### Customer: profile & addresses

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/me` | customer | – | – | – | 200 `CustomerProfileDto` | – |
| PATCH | `/me` | customer | `UpdateCustomerProfileDto` | – | – | 200 `CustomerProfileDto` | – |
| GET | `/me/addresses` | customer | – | – | – | 200 `AddressDto[]` | – |
| POST | `/me/addresses` | customer | `CreateAddressDto` | – | – | 201 `AddressDto` | ADDRESS_LIMIT_REACHED, GOVERNORATE_NOT_FOUND |
| GET | `/me/addresses/{addressId}` | customer | – | – | – | 200 `AddressDto` | ADDRESS_NOT_FOUND |
| PATCH | `/me/addresses/{addressId}` | customer | `UpdateAddressDto` | – | – | 200 `AddressDto` | ADDRESS_NOT_FOUND, GOVERNORATE_NOT_FOUND, DEFAULT_ADDRESS_UNSET_NOT_ALLOWED |
| DELETE | `/me/addresses/{addressId}` | customer | – | – | – | 204 | ADDRESS_NOT_FOUND |

### Customer: cart

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/cart` | customer | – | – | – | 200 `CartDto` | – |
| DELETE | `/cart` | customer | – | – | – | 204 | – |
| POST | `/cart/items` | customer | `AddCartItemDto` | – | – | 201 `CartDto` | VARIANT_NOT_PURCHASABLE, INSUFFICIENT_STOCK, CART_ITEM_QUANTITY_LIMIT, CART_LINE_LIMIT_REACHED |
| PATCH | `/cart/items/{itemId}` | customer | `UpdateCartItemDto` | – | – | 200 `CartDto` | CART_ITEM_NOT_FOUND, VARIANT_NOT_PURCHASABLE, INSUFFICIENT_STOCK |
| DELETE | `/cart/items/{itemId}` | customer | – | – | – | 204 | CART_ITEM_NOT_FOUND |

### Customer: checkout, orders, payment

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| POST | `/checkout` | customer | `CheckoutDto` | – | **required** | 201 `CheckoutResultDto` | CART_EMPTY 422, CART_HAS_ISSUES 409, ADDRESS_NOT_FOUND 422, GOVERNORATE_NOT_DELIVERABLE 422, ORDER_TOTAL_CHANGED 409, ORDER_PAYMENT_PENDING 409 (Kashier, an unpaid order exists), INSUFFICIENT_STOCK 409 |
| GET | `/orders` | customer | – | `limit` `cursor` `sort` `status[eq]` `status[in]` `createdAt[gte]` `createdAt[lte]` | – | 200 `OrderSummaryDto[]` + page | – |
| GET | `/orders/{orderId}` | customer | – | – | – | 200 `OrderDetailDto` | ORDER_NOT_FOUND |
| POST | `/orders/{orderId}/payment/kashier-session` | customer | – | – | – | 200 `KashierSessionDto` | ORDER_NOT_FOUND 404, ORDER_NOT_AWAITING_PAYMENT 409, PAYMENT_PROVIDER_UNAVAILABLE 502 |
| POST | `/orders/{orderId}/seller-orders/{sellerOrderId}/cancel` | customer | `CancelSellerOrderDto` | – | **required** | 200 `OrderDetailDto` | ORDER_NOT_FOUND, SELLER_ORDER_NOT_FOUND, SELLER_ORDER_NOT_CANCELLABLE 409 |

### Seller: profile

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/seller/profile` | seller | – | – | – | 200 `SellerProfileDto` | – |
| PATCH | `/seller/profile` | seller | `UpdateSellerProfileDto` | – | – | 200 `SellerProfileDto` | BUSINESS_NAME_TAKEN, GOVERNORATE_NOT_FOUND |
| POST | `/seller/profile/reapply` | seller | – | – | – | 200 `SellerProfileDto` | SELLER_INVALID_STATUS_TRANSITION |

### Seller: catalog & stock

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/seller/products` | seller | – | `limit` `cursor` `sort` `status[eq]` `status[in]` `categoryId[eq]` `name[like]` `createdAt[gte]` `createdAt[lte]` | – | 200 `SellerProductDto[]` + page | – |
| POST | `/seller/products` | seller | `CreateProductDto` | – | – | 201 `SellerProductDetailDto` | SELLER_NOT_APPROVED, CATEGORY_NOT_FOUND |
| GET | `/seller/products/{productId}` | seller | – | – | – | 200 `SellerProductDetailDto` | PRODUCT_NOT_FOUND |
| PATCH | `/seller/products/{productId}` | seller | `UpdateProductDto` | – | – | 200 `SellerProductDetailDto` | PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, CATEGORY_NOT_FOUND, PRODUCT_CATEGORY_LOCKED |
| DELETE | `/seller/products/{productId}` | seller | – | – | – | 204 | PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED |
| POST | `/seller/products/{productId}/activate` | seller | – | – | – | 200 `SellerProductDetailDto` | PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, PRODUCT_INVALID_STATUS_TRANSITION, PRODUCT_HAS_NO_ACTIVE_VARIANT |
| POST | `/seller/products/{productId}/deactivate` | seller | – | – | – | 200 `SellerProductDetailDto` | PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, PRODUCT_INVALID_STATUS_TRANSITION |
| POST | `/seller/products/{productId}/variants` | seller | `CreateVariantDto` | – | – | 201 `SellerVariantDto` | PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, VARIANT_OPTIONS_INVALID, DEFAULT_VARIANT_EXISTS, VARIANT_COMBINATION_EXISTS, SKU_TAKEN, VARIANT_LIMIT_REACHED, COMPARE_AT_PRICE_INVALID |
| PATCH | `/seller/products/{productId}/variants/{variantId}` | seller | `UpdateVariantDto` | – | – | 200 `SellerVariantDto` | VARIANT_NOT_FOUND, SELLER_NOT_APPROVED, SKU_TAKEN, COMPARE_AT_PRICE_INVALID |
| DELETE | `/seller/products/{productId}/variants/{variantId}` | seller | – | – | – | 204 | VARIANT_NOT_FOUND, SELLER_NOT_APPROVED |
| POST | `/seller/variants/{variantId}/stock-adjustments` | seller | `StockAdjustmentDto` | – | **required** | 200 `VariantStockDto` | VARIANT_NOT_FOUND, SELLER_NOT_APPROVED, STOCK_ADJUSTMENT_INVALID |
| GET | `/seller/variants/{variantId}/stock-movements` | seller | – | `limit` `cursor` `sort` | – | 200 `StockMovementDto[]` + page | VARIANT_NOT_FOUND |

### Seller: orders

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/seller/orders` | seller | – | `limit` `cursor` `sort` `status[eq]` `status[in]` `createdAt[gte]` `createdAt[lte]` | – | 200 `SellerOrderDto[]` + page | – |
| GET | `/seller/orders/{sellerOrderId}` | seller | – | – | – | 200 `SellerOrderDto` | SELLER_ORDER_NOT_FOUND |
| POST | `/seller/orders/{sellerOrderId}/accept` | seller | – | – | – | 200 `SellerOrderDto` | SELLER_ORDER_INVALID_STATUS_TRANSITION 409; SELLER_ORDER_NOT_FOUND 404 |
| POST | `/seller/orders/{sellerOrderId}/cancel` | seller | `CancelSellerOrderDto` | – | **required** | 200 `SellerOrderDto` | SELLER_ORDER_NOT_CANCELLABLE 409; SELLER_ORDER_NOT_FOUND 404 |
| POST | `/seller/orders/{sellerOrderId}/items/{itemId}/cancel` | seller | `CancelOrderItemDto` | – | **required** | 200 `SellerOrderDto` | ORDER_ITEM_NOT_FOUND 404, SELLER_ORDER_NOT_CANCELLABLE 409, ITEM_CANCEL_QUANTITY_INVALID 422; SELLER_ORDER_NOT_FOUND 404 |
| POST | `/seller/orders/{sellerOrderId}/ready` | seller | – | – | – | 200 `SellerOrderDto` | SELLER_ORDER_INVALID_STATUS_TRANSITION 409; SELLER_ORDER_NOT_FOUND 404 |
| POST | `/seller/orders/{sellerOrderId}/return-received` | seller | – | – | **required** | 200 `SellerOrderDto` | SELLER_ORDER_INVALID_STATUS_TRANSITION 409; SELLER_ORDER_NOT_FOUND 404 |

### Seller: finance

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/seller/finance/balance` | seller | – | – | – | 200 `SellerBalanceDto` | – |
| GET | `/seller/finance/entries` | seller | – | `limit` `cursor` `sort` `entryType[eq]` `entryType[in]` `createdAt[gte]` `createdAt[lte]` | – | 200 `LedgerEntryDto[]` + page | – |
| GET | `/seller/finance/payouts` | seller | – | `limit` `cursor` `sort` `createdAt[gte]` `createdAt[lte]` | – | 200 `PayoutDto[]` + page | – |

### Delivery agent

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| PATCH | `/agent/availability` | delivery_agent | `AvailabilityDto` | – | – | 200 `AgentProfileDto` | AGENT_INACTIVE 403 |
| GET | `/agent/finance/balances` | delivery_agent | – | – | – | 200 `AgentBalancesDto` | – |
| GET | `/agent/finance/entries` | delivery_agent | – | `account` `limit` `cursor` `sort` `entryType[eq]` `entryType[in]` `createdAt[gte]` `createdAt[lte]` | – | 200 `LedgerEntryDto[]` + page | INVALID_QUERY 400 |
| GET | `/agent/finance/remittances` | delivery_agent | – | `limit` `cursor` `sort` `createdAt[gte]` `createdAt[lte]` | – | 200 `RemittanceDto[]` + page | – |
| GET | `/agent/profile` | delivery_agent | – | – | – | 200 `AgentProfileDto` | – |
| GET | `/agent/shipments` | delivery_agent | – | `limit` `cursor` `sort` `status[eq]` `status[in]` `createdAt[gte]` `createdAt[lte]` | – | 200 `AgentShipmentDto[]` + page | AGENT_INACTIVE 403 |
| GET | `/agent/shipments/{shipmentId}` | delivery_agent | – | – | – | 200 `AgentShipmentDto` | SHIPMENT_NOT_FOUND, AGENT_INACTIVE 403 |
| POST | `/agent/shipments/{shipmentId}/delivered` | delivery_agent | `DeliveredDto` | – | **required** | 200 `AgentShipmentDto` | SHIPMENT_NOT_FOUND, SHIPMENT_INVALID_STATUS_TRANSITION 409, AGENT_INACTIVE 403, COD_AMOUNT_REQUIRED 422, COD_AMOUNT_NOT_ALLOWED 422, COD_AMOUNT_MISMATCH 422 |
| POST | `/agent/shipments/{shipmentId}/failed-attempt` | delivery_agent | `FailedAttemptDto` | – | **required** | 200 `AgentShipmentDto` | SHIPMENT_NOT_FOUND, SHIPMENT_INVALID_STATUS_TRANSITION 409, AGENT_INACTIVE 403 |
| POST | `/agent/shipments/{shipmentId}/out-for-delivery` | delivery_agent | – | – | – | 200 `AgentShipmentDto` | SHIPMENT_NOT_FOUND, SHIPMENT_INVALID_STATUS_TRANSITION 409, AGENT_INACTIVE 403 |
| POST | `/agent/shipments/{shipmentId}/picked-up` | delivery_agent | – | – | – | 200 `AgentShipmentDto` | SHIPMENT_NOT_FOUND, SHIPMENT_INVALID_STATUS_TRANSITION 409, AGENT_INACTIVE 403 |
| POST | `/agent/shipments/{shipmentId}/returned` | delivery_agent | – | – | **required** | 200 `AgentShipmentDto` | SHIPMENT_NOT_FOUND, SHIPMENT_INVALID_STATUS_TRANSITION 409, AGENT_INACTIVE 403 |

### Admin: users & admins

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| POST | `/admin/admins` | admin | `InviteAdminDto` | – | – | 201 `InvitedAdminDto` | EMAIL_ALREADY_REGISTERED |
| GET | `/admin/admins` | admin | – | `limit` `cursor` `sort` `status[eq]` `status[in]` `createdAt[gte]` `createdAt[lte]` | – | 200 `AdminListItemDto[]` + page | – |
| POST | `/admin/users/{userId}/reactivate` | admin | – | – | – | 200 `UserStatusDto` | USER_NOT_FOUND, USER_INVALID_STATUS_TRANSITION |
| POST | `/admin/users/{userId}/resend-invite` | admin | – | – | – | 204 | USER_NOT_FOUND, USER_NOT_INVITED |
| POST | `/admin/users/{userId}/suspend` | admin | `SuspendUserDto` | – | – | 200 `UserStatusDto` | USER_NOT_FOUND, USER_INVALID_STATUS_TRANSITION, CANNOT_SUSPEND_SELF |

### Admin: sellers & commission

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/sellers` | admin | – | `limit` `cursor` `sort` `status[eq]` `status[in]` `createdAt[gte]` `createdAt[lte]` `businessName[like]` `pickupGovernorateId[eq]` | – | 200 `AdminSellerListItemDto[]` + page | – |
| GET | `/admin/sellers/{sellerId}` | admin | – | – | – | 200 `AdminSellerDetailDto` | SELLER_NOT_FOUND |
| POST | `/admin/sellers/{sellerId}/approve` | admin | – | – | – | 200 `AdminSellerDetailDto` | SELLER_NOT_FOUND, SELLER_INVALID_STATUS_TRANSITION, SELLER_EMAIL_NOT_VERIFIED |
| PUT | `/admin/sellers/{sellerId}/commission-rate` | admin | `SellerCommissionRateDto` | – | – | 200 `AdminSellerDetailDto` | SELLER_NOT_FOUND, COMMISSION_RATE_UNCHANGED |
| POST | `/admin/sellers/{sellerId}/reinstate` | admin | `SellerReinstateDto` | – | – | 200 `AdminSellerDetailDto` | SELLER_NOT_FOUND, SELLER_INVALID_STATUS_TRANSITION |
| POST | `/admin/sellers/{sellerId}/reject` | admin | `SellerDecisionDto` | – | – | 200 `AdminSellerDetailDto` | SELLER_NOT_FOUND, SELLER_INVALID_STATUS_TRANSITION |
| POST | `/admin/sellers/{sellerId}/suspend` | admin | `SellerDecisionDto` | – | – | 200 `AdminSellerDetailDto` | SELLER_NOT_FOUND, SELLER_INVALID_STATUS_TRANSITION |
| GET | `/admin/settings/commission` | admin | – | – | – | 200 `CommissionSettingsDto` | – |
| PUT | `/admin/settings/commission` | admin | `DefaultCommissionDto` | – | – | 200 `CommissionSettingsDto` | – |

### Admin: catalog

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| PATCH | `/admin/attributes/{attributeId}` | admin | `UpdateAttributeDto` | – | – | 200 `AdminAttributeDto` | ATTRIBUTE_NOT_FOUND |
| DELETE | `/admin/attributes/{attributeId}` | admin | – | – | – | 204 | ATTRIBUTE_NOT_FOUND, ATTRIBUTE_IN_USE |
| POST | `/admin/attributes/{attributeId}/options` | admin | `CreateOptionDto` | – | – | 201 `AttributeOptionDto` | ATTRIBUTE_NOT_FOUND, OPTION_CODE_TAKEN, OPTION_LIMIT_REACHED |
| GET | `/admin/categories` | admin | – | – | – | 200 `AdminCategoryNodeDto[]` | – |
| POST | `/admin/categories` | admin | `CreateCategoryDto` | – | – | 201 `AdminCategoryNodeDto` | CATEGORY_NOT_FOUND, CATEGORY_PARENT_INACTIVE, CATEGORY_MAX_DEPTH_EXCEEDED, CATEGORY_NAME_TAKEN, CATEGORY_SLUG_TAKEN, CATEGORY_SLUG_REQUIRED, CATEGORY_CHILD_LIMIT_REACHED |
| PATCH | `/admin/categories/{categoryId}` | admin | `UpdateCategoryDto` | – | – | 200 `AdminCategoryNodeDto` | CATEGORY_NOT_FOUND, CATEGORY_NAME_TAKEN, CATEGORY_SLUG_TAKEN, CATEGORY_IN_USE, CATEGORY_PARENT_INACTIVE |
| POST | `/admin/categories/{categoryId}/attributes` | admin | `CreateAttributeDto` | – | – | 201 `AdminAttributeDto` | CATEGORY_NOT_FOUND, ATTRIBUTE_CODE_CONFLICT, CATEGORY_HAS_PRODUCTS, ATTRIBUTE_LIMIT_REACHED |
| PATCH | `/admin/options/{optionId}` | admin | `UpdateOptionDto` | – | – | 200 `AttributeOptionDto` | OPTION_NOT_FOUND |
| DELETE | `/admin/options/{optionId}` | admin | – | – | – | 204 | OPTION_NOT_FOUND, OPTION_IN_USE |

### Admin: delivery (governorates, settings, agents, shipments)

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| POST | `/admin/delivery-agents` | admin | `CreateAgentDto` | – | – | 201 `AdminAgentDto` | EMAIL_ALREADY_REGISTERED 409, GOVERNORATE_NOT_FOUND 422 |
| GET | `/admin/delivery-agents` | admin | – | `limit` `cursor` `sort` `status[eq]` `onShift[eq]` `homeGovernorateId[eq]` `fullName[like]` `createdAt[gte]` `createdAt[lte]` | – | 200 `AdminAgentDto[]` + page | – |
| GET | `/admin/delivery-agents/{agentId}` | admin | – | – | – | 200 `AdminAgentDto` | AGENT_NOT_FOUND |
| PATCH | `/admin/delivery-agents/{agentId}` | admin | `UpdateAgentDto` | – | – | 200 `AdminAgentDto` | AGENT_NOT_FOUND, GOVERNORATE_NOT_FOUND 422 |
| POST | `/admin/delivery-agents/{agentId}/activate` | admin | – | – | – | 200 `AdminAgentDto` | AGENT_NOT_FOUND, AGENT_INVALID_STATUS_TRANSITION 409 |
| POST | `/admin/delivery-agents/{agentId}/deactivate` | admin | – | – | – | 200 `AdminAgentDto` | AGENT_NOT_FOUND, AGENT_HAS_ACTIVE_SHIPMENTS 409, AGENT_INVALID_STATUS_TRANSITION 409 |
| GET | `/admin/governorates` | admin | – | – | – | 200 `GovernorateDto[]` | – |
| PATCH | `/admin/governorates/{governorateId}` | admin | `UpdateGovernorateDto` | – | – | 200 `GovernorateDto` | GOVERNORATE_NOT_FOUND |
| GET | `/admin/settings/delivery` | admin | – | – | – | 200 `DeliverySettingsDto` | – |
| PUT | `/admin/settings/delivery` | admin | `UpdateDeliverySettingsDto` | – | – | 200 `DeliverySettingsDto` | – |
| GET | `/admin/shipments` | admin | – | `limit` `cursor` `sort` `status[eq]` `status[in]` `agentId[eq]` `orderId[eq]` `createdAt[gte]` `createdAt[lte]` | – | 200 `AdminShipmentDto[]` + page | – |
| GET | `/admin/shipments/{shipmentId}` | admin | – | – | – | 200 `AdminShipmentDto` | SHIPMENT_NOT_FOUND |
| POST | `/admin/shipments/{shipmentId}/assign` | admin | `AssignShipmentDto` | – | – | 200 `AdminShipmentDto` | SHIPMENT_NOT_FOUND 404, AGENT_NOT_FOUND 422, AGENT_INACTIVE 409, SHIPMENT_NOT_ASSIGNABLE 409, SHIPMENT_ALREADY_ASSIGNED_TO_AGENT 409 |

### Admin: orders & payments

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/orders` | admin | – | `limit` `cursor` `sort` `status[eq]` `status[in]` `createdAt[gte]` `createdAt[lte]` `orderNumber[eq]` `customerId[eq]` | – | 200 `AdminOrderSummaryDto[]` + page | – |
| GET | `/admin/orders/{orderId}` | admin | – | – | – | 200 `AdminOrderDetailDto` | ORDER_NOT_FOUND |
| GET | `/admin/orders/{orderId}/payment` | admin | – | – | – | 200 `AdminPaymentDto` | PAYMENT_NOT_FOUND |
| GET | `/admin/payments/{paymentId}` | admin | – | – | – | 200 `AdminPaymentDto` | PAYMENT_NOT_FOUND |
| GET | `/admin/payments/refunds` | admin | – | `limit` `cursor` `sort` `status[eq]` `reason[eq]` `reason[in]` `createdAt[gte]` `createdAt[lte]` | – | 200 `RefundDto[]` + page | – |
| POST | `/admin/payments/refunds/{refundId}/record` | admin | `RecordRefundDto` | – | **required** | 200 `RefundDto` | REFUND_NOT_FOUND 404, REFUND_ALREADY_RECORDED 409 |

### Admin: finance

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/finance/accounts` | admin | – | `limit` `cursor` `sort` `accountType[eq]` `accountType[in]` `ownerId[eq]` `balance[gt]` `balance[gte]` | – | 200 `AccountDto[]` + page | – |
| GET | `/admin/finance/accounts/{accountId}` | admin | – | – | – | 200 `AccountDto` | ACCOUNT_NOT_FOUND |
| GET | `/admin/finance/accounts/{accountId}/entries` | admin | – | `limit` `cursor` `sort` `entryType[eq]` `entryType[in]` `createdAt[gte]` `createdAt[lte]` | – | 200 `LedgerEntryDto[]` + page | ACCOUNT_NOT_FOUND |
| POST | `/admin/finance/cod-remittances` | admin | `CreateRemittanceDto` | – | **required** | 201 `RemittanceDto` | AGENT_NOT_FOUND 422, REMITTANCE_EXCEEDS_BALANCE 422 |
| GET | `/admin/finance/cod-remittances` | admin | – | `limit` `cursor` `sort` `agentId[eq]` `createdAt[gte]` `createdAt[lte]` | – | 200 `RemittanceDto[]` + page | – |
| GET | `/admin/finance/entries` | admin | – | `referenceType` `referenceId` | – | 200 `ReferenceEntryDto[]` | INVALID_QUERY 400 |
| POST | `/admin/finance/payouts` | admin | `CreatePayoutDto` | – | **required** | 201 `PayoutDto` | PAYEE_NOT_FOUND 422, PAYOUT_EXCEEDS_BALANCE 422, PAID_AT_IN_FUTURE 422, PAYOUT_ALREADY_RECORDED 409 |
| GET | `/admin/finance/payouts` | admin | – | `limit` `cursor` `sort` `payeeType[eq]` `payeeId[eq]` `createdAt[gte]` `createdAt[lte]` | – | 200 `PayoutDto[]` + page | – |

### Infrastructure (not called by the web app)

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| POST | `/webhooks/kashier` | public | – | – | – | 200 `WebhookReceivedDto` | INVALID_WEBHOOK_SIGNATURE 401 |
| GET | `/health/live` | public | – | – | – | 200 `inline` | – |
| GET | `/health/ready` | public | – | – | – | 200 `inline` | – |


Total operations: 123.

## 7. Error catalogue [SPEC 01 §6 + module specs; codes VERIFIED in OpenAPI summaries]

The frontend maps errors by **`error.code`**, never by message text (messages are English and not a contract). Codes are globally unique.

### 7.1 Common codes

| Code | HTTP | Frontend handling |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Map `details[].field` onto form fields (dotted paths); unknown fields → form-level error |
| `MALFORMED_JSON` | 400 | Bug: log with correlation id |
| `INVALID_CURSOR` / `INVALID_QUERY` | 400 | Reset list params to defaults; log |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Bug: log |
| `UNAUTHENTICATED` | 401 | Refresh once (serialised), retry once; else end session |
| `FORBIDDEN` | 403 | Wrong role or missing profile: show "not allowed", route to the role's home |
| `ROUTE_NOT_FOUND` | 404 | Bug: log |
| `PAYLOAD_TOO_LARGE` | 413 | Show message |
| `CONFLICT` | 409 | Generic conflict: refetch and show message |
| `IDEMPOTENCY_REQUEST_IN_PROGRESS` | 409 | Wait and retry with the **same** key |
| `IDEMPOTENCY_KEY_REUSED` | 422 | Bug: log |
| `REFERENCE_NOT_FOUND` / `CONSTRAINT_VIOLATION` | 422 | Show message, refetch referenced data |
| `GOVERNORATE_NOT_FOUND` | 404/422 | Refetch governorates |
| `RATE_LIMITED` | 429 | Honour `Retry-After`; disable the action with a countdown |
| `INTERNAL_ERROR` | 500 | Generic error + correlation id |
| `SERVICE_UNAVAILABLE` | 503 | Generic "try again shortly" |

### 7.2 Module codes the UI must handle explicitly

| Area | Code (HTTP) | Meaning for the UI |
|---|---|---|
| identity | `EMAIL_ALREADY_REGISTERED` (409) | Field error on email |
| | `INVALID_CREDENTIALS` (401) | Generic "email or password is wrong" |
| | `EMAIL_NOT_VERIFIED` (403) | Go to verify-email step for that email |
| | `ACCOUNT_SUSPENDED` (403) | Blocking message, no retry |
| | `INVALID_OTP` (400) | Generic "code invalid or expired"; offer resend |
| | `INVALID_REFRESH_TOKEN` (401) | Session over → login |
| | `INVALID_INVITE_TOKEN` (400) | Link invalid/expired → ask an admin to resend |
| | `INVALID_CURRENT_PASSWORD` (400), `PASSWORD_UNCHANGED` (422) | Field errors |
| | `USER_NOT_FOUND` (404), `USER_NOT_INVITED` (409), `USER_INVALID_STATUS_TRANSITION` (409), `CANNOT_SUSPEND_SELF` (409) | Admin user actions |
| customers | `ADDRESS_NOT_FOUND` (404; 422 at checkout), `ADDRESS_LIMIT_REACHED` (422), `DEFAULT_ADDRESS_UNSET_NOT_ALLOWED` (422) | Address book |
| sellers | `SELLER_NOT_FOUND` (404), `SELLER_INVALID_STATUS_TRANSITION` (409), `SELLER_EMAIL_NOT_VERIFIED` (409), `SELLER_NOT_APPROVED` (403), `BUSINESS_NAME_TAKEN` (409), `COMMISSION_RATE_UNCHANGED` (409) | |
| catalog | `CATEGORY_*`, `ATTRIBUTE_*`, `OPTION_*` (admin), `PRODUCT_NOT_FOUND` (404), `PRODUCT_INVALID_STATUS_TRANSITION` (409), `PRODUCT_HAS_NO_ACTIVE_VARIANT` (409), `PRODUCT_CATEGORY_LOCKED` (409), `VARIANT_NOT_FOUND` (404), `VARIANT_OPTIONS_INVALID` (422, with details), `DEFAULT_VARIANT_EXISTS` (409), `VARIANT_COMBINATION_EXISTS` (409), `VARIANT_LIMIT_REACHED` (422), `SKU_TAKEN` (409), `COMPARE_AT_PRICE_INVALID` (422), `STOCK_ADJUSTMENT_INVALID` (422) | Full list with statuses: spec 06 §6 |
| inventory | `INSUFFICIENT_STOCK` (409, details per variant with available qty) | Cart and checkout |
| cart | `CART_ITEM_NOT_FOUND` (404), `VARIANT_NOT_PURCHASABLE` (422), `CART_ITEM_QUANTITY_LIMIT` (422), `CART_LINE_LIMIT_REACHED` (422) | |
| ordering | `CART_EMPTY` (422), `CART_HAS_ISSUES` (409), `GOVERNORATE_NOT_DELIVERABLE` (422), `ORDER_TOTAL_CHANGED` (409, current total in details), `ORDER_PAYMENT_PENDING` (409, pending order id in details), `ORDER_NOT_FOUND` (404), `ORDER_NOT_AWAITING_PAYMENT` (409), `SELLER_ORDER_NOT_FOUND` (404), `SELLER_ORDER_INVALID_STATUS_TRANSITION` (409), `SELLER_ORDER_NOT_CANCELLABLE` (409), `ORDER_ITEM_NOT_FOUND` (404), `ITEM_CANCEL_QUANTITY_INVALID` (422) | Checkout recovery: workflows.md C-6 |
| payments | `PAYMENT_PROVIDER_UNAVAILABLE` (502), `PAYMENT_NOT_FOUND` (404), `REFUND_NOT_FOUND` (404), `REFUND_ALREADY_RECORDED` (409) | |
| delivery | `AGENT_NOT_FOUND` (404/422), `AGENT_INACTIVE` (403/409), `AGENT_HAS_ACTIVE_SHIPMENTS` (409), `AGENT_INVALID_STATUS_TRANSITION` (409), `SHIPMENT_NOT_FOUND` (404), `SHIPMENT_INVALID_STATUS_TRANSITION` (409), `SHIPMENT_NOT_ASSIGNABLE` (409), `SHIPMENT_ALREADY_ASSIGNED_TO_AGENT` (409), `COD_AMOUNT_MISMATCH` / `COD_AMOUNT_REQUIRED` / `COD_AMOUNT_NOT_ALLOWED` (422) | |
| finance | `ACCOUNT_NOT_FOUND` (404), `REMITTANCE_EXCEEDS_BALANCE` (422), `PAYOUT_EXCEEDS_BALANCE` (422), `PAYEE_NOT_FOUND` (422), `PAYOUT_ALREADY_RECORDED` (409), `PAID_AT_IN_FUTURE` (422) | |

## 8. Enumerations the UI renders [VERIFIED in OpenAPI enums unless marked]

| Enum | Values |
|---|---|
| `UserRole` | `customer, seller, admin, delivery_agent` |
| `UserStatus` | `pending_email_verification, invited, active, suspended` |
| `SellerStatus` | `pending_approval, approved, rejected, suspended` |
| `ProductStatus` / `VariantStatus` | `draft, active, inactive` / `active, inactive` |
| `OrderStatus` | `pending_payment, placed, in_progress, completed, partially_completed, cancelled` |
| `SellerOrderStatus` | `pending_payment, placed, accepted, ready_for_pickup, picked_up, out_for_delivery, delivery_failed, returning_to_seller, returned_to_seller, delivered, cancelled` |
| `PaymentMethod` | `cod, kashier` |
| `PaymentStatus` | COD `pending, partially_collected, collected, cancelled`; Kashier `initiated, paid, failed, expired, partially_refunded_manually, refunded_manually` |
| `RefundReason` / `RefundStatus` | `seller_order_cancelled, items_cancelled, delivery_failed, late_payment_after_expiry, all_cancelled_fee, amount_mismatch` / `pending_manual, recorded` |
| `ShipmentStatus` | `unassigned, assigned, picked_up, out_for_delivery, delivery_failed, returning_to_seller, returned_to_seller, delivered, cancelled` |
| `AgentStatus` | `active, inactive` |
| `AttemptFailureReason` | `customer_unreachable, customer_refused, wrong_address, customer_rescheduled` |
| Item cancel `reason` | `out_of_stock, seller_request, other` (`note` required when `other`) [SPEC 09] |
| Cart line `issue` | `UNAVAILABLE, OUT_OF_STOCK, INSUFFICIENT_STOCK` or `null` |
| Finance `accountType` | `seller_payable, agent_fee_payable, agent_cod_cash, platform_commission_revenue, platform_delivery_revenue` [SPEC 12] |
| Ledger `referenceType` | `seller_order, order, cod_remittance, payout` [SPEC 12] |
| Stock movement `type` | `seller_adjustment, reserve, release, commit` [SPEC 07] |
| Seller-order `cancelReason` | `customer_cancelled, seller_cancelled, seller_acceptance_timeout, payment_failed, payment_expired` [VERIFIED `ordering/enums.ts`; a plain string in OpenAPI] |
| Ledger `entryType` | `seller_net_earned, commission_earned, agent_fee_earned, platform_fee_earned, cod_cash_collected, cod_cash_remitted, seller_payout, agent_payout` [VERIFIED `finance/enums.ts`] |
| History `actorRole` | `customer, seller, admin, delivery_agent, system` |

Display labels and Arabic/English copy for every value are a frontend concern (FQ-4). Governorate names come from the API in English; the backend expects clients to localise by `code` (`EG-ALX`, …) [SPEC 11 DE-1].

## 9. Findings: OpenAPI quality (affects type generation) [VERIFIED]

| # | Finding | Evidence | Consequence for the frontend |
|---|---|---|---|
| OA-1 | **Nullable fields are not marked nullable.** They appear as optional (`not in required[]`) `string`/enum, but the API returns `null` | `GovernorateDto.deliveryFee` documented `string`, runtime `"deliveryFee": null`; `AddressDto.floor/apartment/landmark`, `CartDto.id`, `CartItemDto.issue`, `OrderDetailDto.paymentExpiresAt`, … Only 2 `"null"` types in the whole document, 0 `nullable` | Generated types say `T \| undefined`, runtime is `null`. Must be corrected in a post-generation step or by runtime schemas (architecture.md §6.3). **[VERIFIED 2026-10-14, T-B7 contract suite]** confirmed for every checked response, with one correction: `AdminShipmentDto.history` is left out of list items (not `null`) and stays optional (`openapi-fix.ts` `OPTIONAL_RESPONSE_FIELDS`) |
| OA-2 | No `operationId` on any of the 123 operations | – | Generators invent names from paths; prefer a path-keyed client (`openapi-fetch`) over name-keyed generated SDKs, or names will churn |
| OA-3 | Error responses are only a `default: ErrorEnvelope`; codes live in summary text | every operation | Error-code unions are hand-maintained from §7 (single file, reviewed when backend specs change) |
| OA-4 | `GET /products/{idOrSlug}` path param is typed `format: uuid` | `parameters[0].schema` | A slug is valid at runtime. Do not validate this param against the generated schema |
| OA-5 | PATCH DTOs expose a phantom property `__atLeastOneField: {}` (10 schemas, e.g. `UpdateAddressDto`) | schema dump | Must be stripped from generated request types; **sending it would be rejected** (`forbidNonWhitelisted`) |
| OA-6 | `UpdateGovernorateDto.deliveryFee` not in `required[]` though the spec says it is required and nullable | schema + spec 11 §4.3 | Treat as required-nullable in the form |
| OA-7 | `attr.{code}[in]` is documented as a literal parameter name | `/products` params | Hand-written query builder for attribute filters |
| OA-8 | Some timestamps use `oneOf [date, date-time]`, others a regex pattern | `AuthTokensDto`, `KashierSessionDto` | Treat all as ISO strings; parse with one helper |
| OA-9 | Spec/OpenAPI disagreement: `PATCH /agent/availability` for an inactive agent — spec 11 §4.2 table says `AGENT_INACTIVE 409`, §6 says 409 for "goes on shift", DE-5 and the OpenAPI summary say `403` | spec 11 vs OpenAPI | Handle both by code, not status. Backend to confirm (OQ-12) |

## 10. Missing capabilities and ambiguities

Nothing below is to be worked around by inventing endpoints. Each item needs a decision (by you, or by the backend owner).

### 10.1 Blocking or architecture-shaping

| Id | Gap | Why it matters | Options (recommendation first) |
|---|---|---|---|
| **OQ-1** | **Backend sees one IP for all users of a server-side web client.** Rate limits `general` (600/min), `strict-auth` (10/5 min) and `refresh` (30/5 min) are keyed by `req.ip`. A Next.js BFF or SSR render calls the API from its own IP | With a BFF, 10 failed logins across **all** web users in 5 min would block web login for everyone; SSR catalog traffic would share one 600/min budget | (a) **Rec:** backend change so trusted web-server traffic carries the real client IP safely (e.g. a dedicated internal route/listener or a signed client-IP header from the BFF; simply raising `TRUST_PROXY_HOPS` would let mobile clients spoof `X-Forwarded-For`) · (b) browser calls the API directly (CORS) and holds tokens in JS (weaker against XSS, see architecture.md §5) · (c) accept shared limits (not viable at the scale targets). **Needs the backend owner.** |
| **OQ-2** | `KASHIER_REDIRECT_URL` is one global URL, specified as "an https app link agreed with the mobile team" | A web checkout needs Kashier to return the shopper to a web page | (a) **Rec:** one https URL owned by the web app that also works as the mobile universal/app link (opens the app when installed) · (b) a backend change for per-client redirect URLs. The return page never trusts query params; it reads `GET /orders/:id` [SPEC 09 OR-11] |
| **OQ-3** | `INVITE_URL_BASE` is one global URL (an "app link agreed with the mobile team") shared by admin **and** agent invites; the link carries no role | With one app per role (FQ-1 A) the link can't open the right app directly | **Resolved without a backend change** (architecture.md §5.7): `INVITE_URL_BASE = <storefront>/invite`; the page accepts server-side, discards the session, and sends the user to their app's login. Only the env value changes |
| **OQ-4** | CORS allow-list is empty in dev; helmet sends `Cross-Origin-Resource-Policy: same-origin`; CORS exposes no custom headers (`Retry-After`, `X-Correlation-Id`, `Idempotent-Replayed`) | Only matters if the browser calls the API directly (OQ-1 b) | With a BFF: none needed. Direct calls: backend config + `exposedHeaders` change |

### 10.2 Functional gaps (no endpoint exists)

| Id | Gap | Impact |
|---|---|---|
| OQ-7 | **Admin cannot find a customer's or agent's `userId`.** Suspend/reactivate (`/admin/users/:userId/*`) and resend-invite take a `userId`; customer data is exposed only as `customerId` (a profile id, in admin orders) and `AdminAgentDto` has no `userId`. There is no admin customer list/search | Admin can suspend/reactivate **admins only** and resend invites **to admins only** from the UI. Customer suspension and agent invite resend are not buildable |
| OQ-8 | No "current user" endpoint for admins (and no role-agnostic one) | Admin identity in the UI comes from `AuthTokensDto.user` captured at login/refresh; `status` can be stale until the next refresh |
| OQ-9 | No "log out of all devices" | Only via password change (keeps current) or reset |
| OQ-10 | No real-time channel (no WebSocket/SSE/push) | Seller new-order alerts, agent assignments, order tracking: polling only (intervals to agree, mind the 600/min/IP general limit) |
| OQ-11 | No product images (R1, confirmed intended), no reviews, wishlist, coupons, returns (R2) | Catalog UI is text-first; image slots are placeholders or absent |
| – | No totals/counts on lists; no admin dashboards/metrics endpoints | No counters or charts unless computed from paged data (not recommended) |
| – | No admin order cancellation (S-9), no reassignment after pickup (S-18), no email change | UI shows these as not available |
| – | No admin payment list (only refunds queue, payment by id, payment by order) | Payments are reached from an order |
| – | No search suggestions/autocomplete, no category-by-slug endpoint | Category pages resolve slug → id from the cached tree (`GET /categories`) |

### 10.3 Ambiguities to settle (not blocking discovery)

| Id | Question |
|---|---|
| OQ-12 | OA-9 status code for inactive agent availability toggle |
| OQ-13 | Polling intervals and whether a seller sees new orders without reload |
| OQ-14 | Local dev ports: backend 3000 is blocked on this machine and `INVITE_URL_BASE` points at `localhost:3000` |
| OQ-15 | Delivery fee for the shown total: `expectedTotal` = `cart.itemsTotal` + the chosen address's governorate `deliveryFee`, computed client-side with decimal arithmetic. Confirm this is the intended client computation (spec 09 S-8 implies it) |

### 10.4 Recommendations for the backend-side questions (2026-10-14)

You delegated the open choices to my recommendations. Items that need a backend change are **recommended, not decided**: the backend repo's own rules (its `CLAUDE.md` §0 and spec versioning) require a spec change approved there, and this project does not modify backend source.

| Id | Recommendation | Needs a backend change? | Blocks |
|---|---|---|---|
| OQ-1 | **Trusted client-IP header from the BFF.** The BFF sends the end-user IP in a dedicated header (e.g. `X-Nile-Client-Ip`) plus a shared secret (`X-Nile-Bff-Key`, from the secret store, rotatable key ring, compared in constant time). The backend uses that IP for its rate-limit keys **only** when the secret is valid, and ignores the header otherwise, so mobile clients can't spoof it and `TRUST_PROXY_HOPS` stays as it is. Applies to `general`, `strict-auth` and `refresh` | Yes: middleware + env keys + spec 01 §7 + architecture §8 (backend repo) | Production launch; not local development |
| OQ-2 | `KASHIER_REDIRECT_URL = <storefront>/checkout/payment-return`, one static https URL owned by the web storefront; a future mobile app can register the same URL as a universal/app link. The URL can't carry our order id, and Kashier's `merchantOrderId` is the **payment** id [SPEC 10 PA-12], which no customer endpoint maps to an order. So the page finds the order by (1) the order id the storefront saved in `sessionStorage` just before redirecting to Kashier, else (2) `GET /orders?status[in]=pending_payment,placed&limit=1` (newest first; a customer has at most one `pending_payment` order, OR-16). It ignores Kashier's query parameters for the outcome and polls `GET /orders/:id` | No (env value only), once FQ-8 gives the domain | T-F4 in staging; local dev uses a localhost URL |
| OQ-3 | See §10.1: neutral `/invite` page on the storefront | No (env value only) | – |
| OQ-4 | Not needed: the browser never calls the API directly (BFF) | No | – |
| OQ-7 | Accept the gap for R1 (the backend's admin API is "minimal" by design): the admin UI offers suspend/reactivate/resend-invite for **admins only**. If needed later: add `userId` to `AdminAgentDto` and an admin customer lookup | Only if you want the feature | – |
| OQ-8 | Use `user` from `AuthTokensDto`, refreshed on every token refresh (≤ 15 min stale) | No | – |
| OQ-9 | Accept for R1; the security page explains that changing the password signs out other devices | No | – |
| OQ-10 / OQ-13 | Polling only while the tab is visible: seller orders list every 60 s, agent active shipments every 30 s, Kashier return page every 3 s for at most the payment window; no polling elsewhere. Behind the BFF all polling shares one IP until OQ-1 is fixed (another reason it blocks production) | No | – |
| OQ-11 | Accept (R2 scope); no image placeholders in the UI, text-first product cards | No | – |
| OQ-12 | Handle `AGENT_INACTIVE` by code whatever the status (403 or 409); confirm the intended status in the backend spec when convenient | Doc fix only | – |
| OQ-14 | Frontend dev ports outside every excluded range on this machine (implementation-plan T-B1). The backend's own port 3000 is blocked here; running it with a local compose override (e.g. host port 3100) is your call in the backend repo. Excluded ranges are assigned by Windows and can change after a reboot (`netsh interface ipv4 show excludedportrange protocol=tcp`) | No (local override file only) | Local development |
| OQ-15 | Yes: `expectedTotal = cart.itemsTotal + deliveryFee` of the chosen address's governorate, decimal arithmetic, both values fetched fresh on the review step; that is the total shown to the shopper (spec 09 S-8) | No | – |

---

## 11. Release 2 (backend `main` `ecbcd19`, 2026-10-23) [T-J0]

Status of this section: **v1.0 APPROVED (2026-10-23) with T-J0.** Plan: `release-2-plan.md`.

### 11.0 Sources and how far each is verified

1. **OpenAPI served by the local backend container** (built at R2-P5, before returns and coupons): 187 operations, fetched 2026-10-23 from `GET /api/v1/docs/openapi.json`. The 64 operations it adds to the pinned snapshot are listed in §11.1 as generated from that document **[VERIFIED]**.
2. **Backend source at `ecbcd19`** (`src/app/{returns,promotions,payments,finance,cart}/constants.ts` and `routes.ts`) for the 30 operations of R2-P6/R2-P7 that the container doesn't serve yet: §11.2 **[VERIFIED paths and guards; bodies and DTOs SPEC]**.
3. **Backend specs** 00 §10, 01 §9, 03…13 Release 2 sections, 14…20, `docs/realtime.md`.

T-J1 rebuilds the backend at `ecbcd19`, pulls the snapshot and re-checks every row of this section against it (OQ-19). Expected total: **217** operations.

### 11.1 New operations served by the R2-P5 container [VERIFIED, generated]

"Documented errors" are parsed from the operation summaries as in §6. Rows showing `–` have their errors only in the backend spec (listed in §11.4). Role is read from the security block and the path prefix.

#### admin: audit

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/audit-log` | admin | – | `limit`, `cursor`, `sort`, `actorUserId[eq]`, `action[eq]`, `action[in]`, `targetType[eq]`, `targetId[eq]`, `createdAt[gte]`, `createdAt[lte]` | – | 200 `AuditEntryDto[]` | INVALID_QUERY |
| GET | `/admin/audit-log/{entryId}` | admin | – | – | – | 200 `AuditEntryDto` | AUDIT_ENTRY_NOT_FOUND |

#### admin: catalog

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| PUT | `/admin/categories/{categoryId}/image` | admin | `SetCategoryImageDto` | – | – | 200 `AdminCategoryNodeDto` | CATEGORY_NOT_FOUND, MEDIA_NOT_ATTACHABLE |
| DELETE | `/admin/categories/{categoryId}/image` | admin | – | – | – | 204 | CATEGORY_NOT_FOUND |
| GET | `/admin/products/{productId}` | admin | – | – | – | 200 `AdminProductDetailDto` | PRODUCT_NOT_FOUND |
| POST | `/admin/products/{productId}/block` | admin | `BlockProductDto` | – | – | 200 `AdminProductDetailDto` | PRODUCT_NOT_FOUND, PRODUCT_BLOCK_INVALID_STATUS |
| POST | `/admin/products/{productId}/unblock` | admin | – | – | – | 200 `AdminProductDetailDto` | PRODUCT_NOT_FOUND, PRODUCT_BLOCK_INVALID_STATUS |

#### admin: customers

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/customers` | admin | – | `limit`, `cursor`, `sort`, `name[like]`, `phone[eq]` | – | 200 `AdminCustomerDto[]` | – |
| GET | `/admin/customers/{customerId}` | admin | – | – | – | 200 `AdminCustomerDetailDto` | CUSTOMER_NOT_FOUND |

#### admin: dashboard

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/dashboard` | admin | – | – | – | 200 `DashboardDto` | – |

#### admin: orders

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| POST | `/admin/orders/{orderId}/cancel` | admin | `AdminCancelDto` | – | required | 200 `AdminOrderDetailDto` | ORDER_NOT_FOUND, ORDER_NOT_CANCELLABLE |
| POST | `/admin/seller-orders/{sellerOrderId}/cancel` | admin | `AdminCancelDto` | – | required | 200 `AdminOrderDetailDto` | SELLER_ORDER_NOT_FOUND, SELLER_ORDER_NOT_CANCELLABLE |

#### admin: reviews

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/reviews` | admin | – | `limit`, `cursor`, `status[eq]`, `productId[eq]`, `sellerId[eq]`, `customerId[eq]`, `rating[lte]` | – | 200 `AdminReviewDto[]` | – |
| GET | `/admin/reviews/{reviewId}` | admin | – | – | – | 200 `AdminReviewDto` | REVIEW_NOT_FOUND |
| POST | `/admin/reviews/{reviewId}/hide` | admin | `HideDto` | – | – | 200 `AdminReviewDto` | REVIEW_NOT_FOUND, REVIEW_INVALID_STATUS_TRANSITION |
| POST | `/admin/reviews/{reviewId}/reply/hide` | admin | `HideDto` | – | – | 200 `AdminReviewDto` | REVIEW_NOT_FOUND, REVIEW_REPLY_NOT_FOUND, REVIEW_INVALID_STATUS_TRANSITION |
| POST | `/admin/reviews/{reviewId}/reply/unhide` | admin | – | – | – | 200 `AdminReviewDto` | REVIEW_NOT_FOUND, REVIEW_REPLY_NOT_FOUND, REVIEW_INVALID_STATUS_TRANSITION |
| POST | `/admin/reviews/{reviewId}/unhide` | admin | – | – | – | 200 `AdminReviewDto` | REVIEW_NOT_FOUND, REVIEW_INVALID_STATUS_TRANSITION |

#### admin: support

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/support/tickets` | admin | – | `limit`, `cursor`, `sort`, `status[eq]`, `status[in]`, `category[eq]`, `category[in]`, `openerRole[eq]`, `assignedAdminId[eq]`, `assigned[eq]`, `slaBreached[eq]`, `createdAt[gte]`, `createdAt[lte]` | – | 200 `AdminTicketSummaryDto[]` | INVALID_QUERY |
| GET | `/admin/support/tickets/{ticketId}` | admin | – | – | – | 200 `AdminTicketSummaryDto` | SUPPORT_TICKET_NOT_FOUND |
| POST | `/admin/support/tickets/{ticketId}/assign` | admin | `AssignTicketDto` | – | – | 200 `AdminTicketSummaryDto` | SUPPORT_TICKET_NOT_FOUND, SUPPORT_ASSIGNEE_INVALID, SUPPORT_TICKET_CLOSED |
| POST | `/admin/support/tickets/{ticketId}/close` | admin | – | – | – | 200 `AdminTicketSummaryDto` | SUPPORT_TICKET_NOT_FOUND, SUPPORT_TICKET_INVALID_STATUS_TRANSITION |
| GET | `/admin/support/tickets/{ticketId}/messages` | admin | – | `limit`, `cursor`, `sort` | – | 200 `TicketMessageDto[]` | SUPPORT_TICKET_NOT_FOUND |
| POST | `/admin/support/tickets/{ticketId}/messages` | admin | `AdminPostMessageDto` | – | required | 201 `TicketMessageDto` | SUPPORT_TICKET_NOT_FOUND, SUPPORT_TICKET_CLOSED, MEDIA_NOT_ATTACHABLE |
| POST | `/admin/support/tickets/{ticketId}/read` | admin | – | – | – | 204 | SUPPORT_TICKET_NOT_FOUND |
| POST | `/admin/support/tickets/{ticketId}/resolve` | admin | – | – | – | 200 `AdminTicketSummaryDto` | SUPPORT_TICKET_NOT_FOUND, SUPPORT_TICKET_INVALID_STATUS_TRANSITION |

#### admin: users

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/users` | admin | – | `limit`, `cursor`, `sort`, `role[eq]`, `status[eq]`, `status[in]`, `email[like]`, `createdAt[gte]`, `createdAt[lte]` | – | 200 `AdminUserListItemDto[]` | – |

#### catalog: reviews

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/products/{productId}/reviews` | public | – | `limit`, `cursor`, `sort`, `rating[eq]`, `rating[in]`, `hasImages[eq]` | – | 200 `ReviewDto[]` | PRODUCT_NOT_FOUND |
| GET | `/products/{productId}/reviews/summary` | public | – | – | – | 200 `RatingSummaryDto` | PRODUCT_NOT_FOUND |

#### customer: wishlist

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/me/wishlist` | customer | – | `limit`, `cursor` | – | 200 `WishlistItemDto[]` | – |
| PUT | `/me/wishlist/{productId}` | customer | – | – | – | 204 | PRODUCT_NOT_FOUND, WISHLIST_LIMIT_REACHED |
| DELETE | `/me/wishlist/{productId}` | customer | – | – | – | 204 | – |
| GET | `/me/wishlist/product-ids` | customer | – | – | – | 200 `WishlistProductIdsDto` | – |

#### media

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/media/{mediaId}` | any role | – | – | – | 200 `MediaDto` | MEDIA_NOT_FOUND |
| POST | `/media/uploads` | any role | `CreateUploadDto` | – | – | 201 `UploadTicketDto` | MEDIA_PURPOSE_NOT_ALLOWED, MEDIA_OPEN_UPLOAD_LIMIT_REACHED |
| POST | `/media/uploads/{mediaId}/complete` | any role | – | – | – | 200 `MediaDto` | MEDIA_NOT_FOUND, MEDIA_UPLOAD_MISSING, MEDIA_UPLOAD_INVALID, MEDIA_INVALID_STATUS, SERVICE_UNAVAILABLE |

#### notifications

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/me/notification-preferences` | any role | – | – | – | 200 `NotificationPreferenceDto[]` | – |
| PUT | `/me/notification-preferences` | any role | `UpdatePreferencesDto` | – | – | 200 `NotificationPreferenceDto[]` | – |
| GET | `/me/notifications` | any role | – | `limit`, `cursor`, `sort`, `read[eq]`, `category[eq]`, `category[in]` | – | 200 `UserNotificationDto[]` | – |
| POST | `/me/notifications/{notificationId}/read` | any role | – | – | – | 204 | NOTIFICATION_NOT_FOUND |
| POST | `/me/notifications/read-all` | any role | – | – | – | 204 | – |
| GET | `/me/notifications/unread-count` | any role | – | – | – | 200 `UnreadCountDto` | – |
| POST | `/me/push-subscriptions` | any role | `RegisterPushSubscriptionDto` | – | – | 201 | PUSH_ENDPOINT_NOT_ALLOWED |
| POST | `/me/push-subscriptions/unregister` | any role | `UnregisterPushSubscriptionDto` | – | – | 204 | – |
| GET | `/push/config` | any role | – | – | – | 200 `PushConfigDto` | – |

#### reviews

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/me/reviewable-items` | customer | – | `limit`, `cursor`, `sort` | – | 200 `ReviewableItemDto[]` | – |
| GET | `/me/reviews` | customer | – | `limit`, `cursor`, `sort` | – | 200 `MyReviewDto[]` | – |
| GET | `/me/reviews/{reviewId}` | customer | – | – | – | 200 `MyReviewDto` | REVIEW_NOT_FOUND |
| PATCH | `/me/reviews/{reviewId}` | customer | `EditReviewDto` | – | – | 200 `MyReviewDto` | REVIEW_NOT_FOUND, REVIEW_EDIT_WINDOW_CLOSED, MEDIA_NOT_ATTACHABLE |
| DELETE | `/me/reviews/{reviewId}` | customer | – | – | – | 204 | REVIEW_NOT_FOUND |
| POST | `/reviews` | customer | `CreateReviewDto` | – | – | 201 `MyReviewDto` | REVIEW_NOT_ALLOWED, REVIEW_WINDOW_CLOSED, REVIEW_ALREADY_EXISTS, MEDIA_NOT_ATTACHABLE |

#### seller: catalog

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| POST | `/seller/products/{productId}/images` | seller | `AddProductImageDto` | – | – | 201 `ProductImageDto[]` | PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, PRODUCT_IMAGE_LIMIT_REACHED, VARIANT_NOT_FOUND, MEDIA_NOT_ATTACHABLE |
| PATCH | `/seller/products/{productId}/images/{imageId}` | seller | `UpdateProductImageDto` | – | – | 200 `ProductImageDto` | PRODUCT_IMAGE_NOT_FOUND, SELLER_NOT_APPROVED, VARIANT_NOT_FOUND |
| DELETE | `/seller/products/{productId}/images/{imageId}` | seller | – | – | – | 204 | PRODUCT_IMAGE_NOT_FOUND, SELLER_NOT_APPROVED |
| PUT | `/seller/products/{productId}/images/order` | seller | `ReorderProductImagesDto` | – | – | 200 `ProductImageDto[]` | PRODUCT_NOT_FOUND, SELLER_NOT_APPROVED, PRODUCT_IMAGE_ORDER_INVALID |

#### seller: reviews

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/seller/reviews` | seller | – | `limit`, `cursor`, `sort`, `productId[eq]`, `rating[in]`, `replied[eq]`, `createdAt[gte]` | – | 200 `SellerReviewDto[]` | – |
| POST | `/seller/reviews/{reviewId}/reply` | seller | `ReplyDto` | – | – | 201 `SellerReviewDto` | SELLER_NOT_APPROVED, REVIEW_NOT_FOUND, REVIEW_HIDDEN, REVIEW_ALREADY_REPLIED |

#### sellers

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/sellers/{sellerId}` | public | – | – | – | 200 `PublicSellerDto` | SELLER_NOT_FOUND |

#### support

| Method | Path | Role | Body | Query | Idem | Success | Documented errors |
|---|---|---|---|---|---|---|---|
| GET | `/support/tickets` | customer, seller | – | `limit`, `cursor`, `sort`, `status[eq]`, `status[in]`, `category[eq]`, `category[in]`, `createdAt[gte]`, `createdAt[lte]` | – | 200 `TicketSummaryDto[]` | – |
| POST | `/support/tickets` | customer, seller | `CustomerOpenTicketDto` | – | required | 201 `TicketSummaryDto` | SUPPORT_CATEGORY_NOT_ALLOWED, ORDER_NOT_FOUND, SELLER_ORDER_NOT_FOUND, SUPPORT_OPEN_TICKET_LIMIT_REACHED, MEDIA_NOT_ATTACHABLE |
| GET | `/support/tickets/{ticketId}` | customer, seller | – | – | – | 200 `TicketSummaryDto` | SUPPORT_TICKET_NOT_FOUND |
| GET | `/support/tickets/{ticketId}/messages` | customer, seller | – | `limit`, `cursor`, `sort` | – | 200 `TicketMessageDto[]` | SUPPORT_TICKET_NOT_FOUND |
| POST | `/support/tickets/{ticketId}/messages` | customer, seller | `PostMessageDto` | – | required | 201 `TicketMessageDto` | SUPPORT_TICKET_NOT_FOUND, SUPPORT_TICKET_CLOSED, MEDIA_NOT_ATTACHABLE |
| POST | `/support/tickets/{ticketId}/read` | customer, seller | – | – | – | 204 | SUPPORT_TICKET_NOT_FOUND |

### 11.2 New operations on `main` not yet served locally (R2-P6 returns and refunds, R2-P7 coupons) [VERIFIED paths, SPEC bodies]

#### returns (spec 18 §4)

| Method | Path | Role | Body | Query | Idem | Success | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/orders/{orderId}/seller-orders/{sellerOrderId}/returnable-items` | customer | – | – | – | 200 `{ windowEndsAt, items: { orderItemId, returnable, paidUnitAmount }[], returnFee }` | ORDER_NOT_FOUND, SELLER_ORDER_NOT_FOUND, RETURN_NOT_ALLOWED, RETURN_WINDOW_CLOSED, RETURN_PICKUP_UNAVAILABLE |
| POST | `/returns` | customer | `sellerOrderId`, `reason`, `description?`, `items[{ orderItemId, quantity }]`, `photoMediaIds?`, `refundPayout?` | – | required | 201 `ReturnDto` | + RETURN_QUANTITY_INVALID, RETURN_ALREADY_OPEN, RETURN_AMOUNT_TOO_LOW, RETURN_PHOTOS_REQUIRED, MEDIA_NOT_ATTACHABLE |
| GET | `/returns` | customer | – | `status[eq,in]`, `createdAt[gte,lte]`, sort | – | 200 `ReturnDto[]` | – |
| GET | `/returns/{returnId}` | customer | – | – | – | 200 `ReturnDto` | RETURN_NOT_FOUND |
| POST | `/returns/{returnId}/cancel` | customer | – | – | – | 200 `ReturnDto` | RETURN_NOT_FOUND, RETURN_INVALID_STATUS_TRANSITION |
| POST | `/returns/{returnId}/escalate` | customer | `note` (3..500) | – | – | 200 `ReturnDto` | + RETURN_ESCALATION_WINDOW_CLOSED |
| GET | `/seller/returns` | seller | – | `status[eq,in]`, sort `createdAt`, `sellerDecisionDeadlineAt` | – | 200 `SellerReturnDto[]` | – |
| GET | `/seller/returns/{returnId}` | seller | – | – | – | 200 `SellerReturnDto` | RETURN_NOT_FOUND |
| POST | `/seller/returns/{returnId}/approve` | seller | – | – | – | 200 | RETURN_NOT_FOUND, RETURN_INVALID_STATUS_TRANSITION |
| POST | `/seller/returns/{returnId}/reject` | seller | `reason` (3..500) | – | – | 200 | same |
| POST | `/seller/returns/{returnId}/confirm-receipt` | seller | `items[{ returnItemId, restock }]` (every item once) | – | required | 200 | + RETURN_ITEMS_MISMATCH |
| POST | `/seller/returns/{returnId}/dispute` | seller | `reason` (3..500), `photoMediaIds?` (≤ 4) | – | – | 200 | + RETURN_INSPECTION_WINDOW_CLOSED, MEDIA_NOT_ATTACHABLE |
| GET | `/admin/returns` | admin | – | `status`, `reason` (`eq,in`), `sellerId`, `customerId`, sort `createdAt` | – | 200 `AdminReturnDto[]` | – |
| GET | `/admin/returns/{returnId}` | admin | – | – | – | 200 `AdminReturnDto` | RETURN_NOT_FOUND |
| POST | `/admin/returns/{returnId}/decide` | admin | `decision` (`approve`, `reject`), `note` (3..500) | – | – | 200 | RETURN_NOT_FOUND, RETURN_INVALID_STATUS_TRANSITION |
| POST | `/admin/returns/{returnId}/resolve-dispute` | admin | `decision` (`refund`, `no_refund`), `note` (3..500) | – | required | 200 | same |

#### coupons (spec 19 §4) and coupon preview (spec 08 §8)

| Method | Path | Role | Body | Query | Idem | Success | Errors |
|---|---|---|---|---|---|---|---|
| POST | `/cart/coupon-preview` | customer | `code` (4..32) | – | – | 200 `CouponQuoteDto` | COUPON_NOT_FOUND, COUPON_INACTIVE, COUPON_NOT_ACTIVE_YET, COUPON_EXPIRED, COUPON_LIMIT_REACHED, COUPON_CUSTOMER_LIMIT_REACHED, COUPON_NOT_APPLICABLE, COUPON_MIN_SUBTOTAL_NOT_MET, CART_EMPTY, RATE_LIMITED (`coupon-preview`, 20/min) |
| GET | `/seller/coupons` | seller | – | `status[eq]`, sort `createdAt` | – | 200 `CouponDto[]` | – |
| POST | `/seller/coupons` | seller | `CreateCouponDto` (scope `seller` / `category`) | – | – | 201 `CouponDto` | SELLER_NOT_APPROVED, COUPON_INVALID, COUPON_CODE_TAKEN, CATEGORY_NOT_FOUND |
| GET | `/seller/coupons/{couponId}` | seller | – | – | – | 200 `CouponDto` | COUPON_NOT_FOUND |
| PATCH | `/seller/coupons/{couponId}` | seller | create fields, all optional, `code` excluded | – | – | 200 `CouponDto` | COUPON_NOT_FOUND, COUPON_LOCKED, COUPON_INVALID, COUPON_BLOCKED, SELLER_NOT_APPROVED |
| GET | `/admin/coupons` | admin | – | `funding`, `status`, `sellerId`, `code` (`eq`), sort `createdAt` | – | 200 `CouponDto[]` | – |
| POST | `/admin/coupons` | admin | `CreateCouponDto` (platform-funded) | – | – | 201 `CouponDto` | COUPON_INVALID, COUPON_CODE_TAKEN, CATEGORY_NOT_FOUND, SELLER_NOT_FOUND |
| GET | `/admin/coupons/{couponId}` | admin | – | – | – | 200 `CouponDto` + last 50 redemptions | COUPON_NOT_FOUND |
| PATCH | `/admin/coupons/{couponId}` | admin | as seller, platform coupons only | – | – | 200 `CouponDto` | + COUPON_SELLER_FUNDED |
| POST | `/admin/coupons/{couponId}/block` | admin | `reason` (3..500) | – | – | 200 `CouponDto` | COUPON_NOT_FOUND, COUPON_BLOCK_INVALID_STATUS |
| POST | `/admin/coupons/{couponId}/unblock` | admin | – | – | – | 200 `CouponDto` | same |

#### refunds and finance (spec 10 §8.4, spec 12 §8.6)

| Method | Path | Role | Body | Query | Idem | Success | Errors |
|---|---|---|---|---|---|---|---|
| GET | `/admin/payments/refunds/{refundId}` | admin | – | – | – | 200 refund with decrypted COD payout details (`{ method, walletNumber \| instapayAddress }`) | REFUND_NOT_FOUND |
| POST | `/admin/payments/refunds/{refundId}/retry` | admin | – | – | – | 200 | REFUND_NOT_RETRYABLE |
| GET | `/seller/finance/holds` | seller | – | cursor, limit | – | 200 `{ sellerOrderId, orderNumber, heldAmount, releaseAfter, blockedByReturn }[]` | – |

### 11.3 Changed operations (existing screens are affected)

| Operation / DTO | Change | Source | Affects |
|---|---|---|---|
| `GET /products`, `ProductListItemDto` | + `primaryImage`, `rating { avg, count }`; filter `rating[gte]`, sort `rating` | VERIFIED (DTO), SPEC 06 §9.3 (filter) | SF-01…SF-04 |
| `GET /products/{idOrSlug}`, `ProductDetailDto` | + `images: ProductImageDto[]`, `rating`, `seller.ratingAvg/ratingCount`, `variants[].imageId` | VERIFIED | SF-05 |
| `GET /categories`, `CategoryNodeDto`, `AdminCategoryNodeDto` | + `image` (with `altText`) | VERIFIED | SF-01/02, AD-07 |
| `GET /cart`, `CartItemDto` | + `image` | VERIFIED | SF-06, SF-07 |
| `OrderItemDto` | + `image`; `discountAmount`, `paidTotal`, `returnedQuantity` | VERIFIED (`image`), SPEC 09 §8.7/§8.8 | SF-08, SF-18, SE-15, AD-15 |
| `CustomerSellerOrderDto` | + `cancelReason` (includes `admin_cancelled`); + `discountAmount`, `discountFunding`, `returnedPaid` | VERIFIED (`cancelReason`), SPEC | SF-18 |
| `OrderDetailDto` | + `coupon { code, discountTotal } \| null`; refunds list (`{ amount, status, reason, at }[]`) | SPEC 09 §8.8, 10 §8.5 | SF-08, SF-18 |
| `POST /checkout` | + `couponCode?` (4..32); `expectedTotal` = items total − coupon discount + delivery fee; coupon `422` codes | SPEC 09 §8.8 | SF-07 (OQ-15 formula changes) |
| `SellerOrderDto` (seller, admin) | + `discountAmount`, `discountFunding`, `returnedSubtotal`, `returnedCommission`, `returnedSellerNet` | SPEC 09 §8.7/§8.8 | SE-14/15, AD-14/15 |
| `SellerProductDto`, `SellerProductDetailDto` | + `primaryImage`, `images`, `adminBlocked`, `adminBlockReason`; status change on a blocked product → `409 PRODUCT_BLOCKED` | VERIFIED | SE-08…SE-10 |
| `SellerProfileDto`, `AdminSeller*Dto` | + `ratingAvg`, `ratingCount` | VERIFIED | SE-07, AD-04/05 |
| `GET /seller/finance/balance` | `{ balance, updatedAt }` → `{ available, pending, updatedAt }`, `available` may be negative | SPEC 12 §8.6 | SE-06, SE-16 (**breaking**, plan B-2) |
| `PaymentStatus` | `partially_refunded_manually`, `refunded_manually` → `partially_refunded`, `refunded` | SPEC 10 PA-23 | SF-18, AD-15/17 (**breaking**, B-1) |
| `GET /admin/payments/refunds` | every status listed; new `RefundStatus` values; reason `return`; method | SPEC 10 §8.4 | AD-16 queue (B-3) |
| `AgentShipmentDto`, `AdminShipmentDto` | + `kind`, `returnId`; filter `kind[eq]`; status `pickup_failed`; returns collect `"0.00"` | SPEC 11 §8.3, DE-26 | AG-04/05, AD-12/13 (B-4) |
| `POST /agent/shipments/{id}/picked-up`, `/failed-attempt`, `/delivered` | also valid for return shipments (pickup at the customer, hand-over to the seller, no amount) | SPEC 11 UC-DE-9 | AG-04/05 |
| `DashboardDto` | + `finance.sellerPending`, `finance.customerRefundPayable`, `delivery.returnsInProgress`, `returns.byStatus` | SPEC 20 v1.5 (the R2-P5 container lacks them) | AD-02 |
| Finance enums | account types `seller_pending`, `customer_refund_payable`, `platform_promotions`; entry and reference types (§11.5) | SPEC 12 §8.1 | SE-16, AD-18…AD-22 (B-6) |
| Token endpoints | header `X-Nile-Client: web` switches the refresh token to a cookie | SPEC 03 §8 | none: the BFF strips the header (plan B-9) |

### 11.4 New error codes (to add to §7 and `error-codes.ts` in T-J1)

| Area | Code | HTTP |
|---|---|---|
| media | `MEDIA_NOT_FOUND` 404 · `MEDIA_PURPOSE_NOT_ALLOWED` 403 · `MEDIA_OPEN_UPLOAD_LIMIT_REACHED` 422 · `MEDIA_UPLOAD_MISSING` 409 · `MEDIA_UPLOAD_INVALID` 422 · `MEDIA_INVALID_STATUS` 409 · `MEDIA_NOT_ATTACHABLE` 422 (details per id: `not_found`, `not_ready`, `wrong_purpose`, `already_claimed`, `duplicate`) | |
| catalog | `PRODUCT_IMAGE_NOT_FOUND` 404 · `PRODUCT_IMAGE_LIMIT_REACHED` 422 · `PRODUCT_IMAGE_ORDER_INVALID` 422 · `PRODUCT_BLOCKED` 409 · `PRODUCT_BLOCK_INVALID_STATUS` 409 | |
| notifications | `NOTIFICATION_NOT_FOUND` 404 · `PUSH_ENDPOINT_NOT_ALLOWED` 422 | |
| support | `SUPPORT_TICKET_NOT_FOUND` 404 · `SUPPORT_CATEGORY_NOT_ALLOWED` 422 · `SUPPORT_OPEN_TICKET_LIMIT_REACHED` 422 · `SUPPORT_TICKET_CLOSED` 409 · `SUPPORT_ASSIGNEE_INVALID` 422 · `SUPPORT_TICKET_INVALID_STATUS_TRANSITION` 409 | |
| reviews | `REVIEW_NOT_ALLOWED` 422 · `REVIEW_WINDOW_CLOSED` 422 · `REVIEW_ALREADY_EXISTS` 409 · `REVIEW_NOT_FOUND` 404 · `REVIEW_EDIT_WINDOW_CLOSED` 422 · `REVIEW_HIDDEN` 409 · `REVIEW_ALREADY_REPLIED` 409 · `REVIEW_REPLY_NOT_FOUND` 404 · `REVIEW_INVALID_STATUS_TRANSITION` 409 | |
| customers | `WISHLIST_LIMIT_REACHED` 422 · `CUSTOMER_NOT_FOUND` 404 | |
| sellers | `SELLER_NOT_FOUND` 404 (public seller page) | |
| ordering | `ORDER_NOT_CANCELLABLE` 409 (`details`: blocking seller-order ids) · `RETURN_QUANTITY_INVALID` 422 · `KASHIER_TOTAL_ZERO` 422 (a card checkout whose total is 0.00 after a coupon; COD works at zero, backend OR-32, PR-21) [found in T-J1] | |
| returns | `RETURN_NOT_FOUND` 404 · `RETURN_NOT_ALLOWED` 422 · `RETURN_WINDOW_CLOSED` 422 · `RETURN_PICKUP_UNAVAILABLE` 422 · `RETURN_AMOUNT_TOO_LOW` 422 · `RETURN_ALREADY_OPEN` 409 · `RETURN_INVALID_STATUS_TRANSITION` 409 · `RETURN_ESCALATION_WINDOW_CLOSED` 409 · `RETURN_INSPECTION_WINDOW_CLOSED` 409 · `RETURN_ITEMS_MISMATCH` 422 · `RETURN_PHOTOS_REQUIRED` 422 | |
| payments | `REFUND_NOT_FOUND` 404 · `REFUND_NOT_RETRYABLE` 409 | |
| promotions | `COUPON_NOT_FOUND` 422 (checkout / preview) or 404 (management) · `COUPON_INACTIVE` · `COUPON_NOT_ACTIVE_YET` · `COUPON_EXPIRED` · `COUPON_LIMIT_REACHED` · `COUPON_CUSTOMER_LIMIT_REACHED` · `COUPON_NOT_APPLICABLE` · `COUPON_MIN_SUBTOTAL_NOT_MET` (details: missing amount) · `COUPON_INVALID` (all 422) · `COUPON_CODE_TAKEN` · `COUPON_LOCKED` · `COUPON_BLOCKED` · `COUPON_BLOCK_INVALID_STATUS` · `COUPON_SELLER_FUNDED` (all 409) | |
| audit | `AUDIT_ENTRY_NOT_FOUND` 404 | |

T-J1 (2026-10-23): `packages/api/src/error-codes.ts` holds all 171 backend codes at `ecbcd19`, extracted from `src/lib/error` and `src/app/*/errors.ts` (62 new).
| realtime (socket) | `ORIGIN_NOT_ALLOWED` is also in the backend error catalogue (T-J1); connect: `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `ORIGIN_NOT_ALLOWED`, `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`; ack: `SUPPORT_TICKET_NOT_FOUND`, `VALIDATION_FAILED`, `RATE_LIMITED`, `INTERNAL_ERROR`; disconnect reasons `token_expired`, `server_shutting_down`, `account_suspended` (`session.ended`) | |

### 11.5 New enumerations

| Enum | Values | Source |
|---|---|---|
| `MediaPurpose` | `product_image, category_image, support_attachment, review_image, return_photo` | VERIFIED |
| `MediaStatus` | `pending, processing, ready, failed` | VERIFIED |
| `MediaFailureReason` | `decode_failed, unsupported_type, dimensions_out_of_range` | VERIFIED |
| `NotificationCategory` | `orders, shipments, support, promotions` | VERIFIED |
| `NotificationType` | one per row of spec 13 §8.2, §8.8, §8.9, NO-35 (`order_placed` … `coupon_blocked`) | VERIFIED (T-J1 lists them) |
| `TicketCategory` | `order, payment, delivery, return, account, seller_onboarding, other` (`seller_onboarding` sellers only) | VERIFIED |
| `TicketStatus` | `open, awaiting_admin, awaiting_user, resolved, closed` | VERIFIED |
| `TicketOpenerRole` / `MessageKind` | `customer, seller` / `message, internal_note, system` | VERIFIED |
| `ReviewStatus` | `published, hidden` | VERIFIED |
| `ReturnReason` | `damaged, wrong_item, not_as_described, changed_mind` (first three seller-fault) | SPEC 18 |
| `ReturnStatus` | open `requested, rejected, escalated, approved, picked_up, received, disputed`; terminal `completed, refused, cancelled, pickup_failed` | SPEC 18 |
| `ReturnRefusalReason` / `ReturnFeePayer` / `RefundPayoutMethod` | `seller_rejected, admin_rejected, dispute_upheld` / `seller, customer` / `mobile_wallet, instapay` | SPEC 18 |
| `ReturnDto.refund.status` | `pending, processing, succeeded, manual` | SPEC 18 §4 |
| `RefundStatus` | `pending_auto, processing, succeeded, pending_manual, recorded`; `RefundReason` + `return`; method `kashier_auto, manual` | SPEC 10 §8.1 |
| `PaymentStatus` | `partially_refunded`, `refunded` replace the `_manually` values | SPEC 10 PA-23 |
| `ShipmentKind` / `ShipmentStatus` | `delivery, return` / + `pickup_failed` | SPEC 11 §8.1 |
| `SellerOrderCancelReason` | + `admin_cancelled` | VERIFIED |
| `StockMovementType` | + `return_restock` (a return the seller put back in stock) | VERIFIED (T-J1), SPEC 07 §8 |
| `CouponFunding` / `DiscountType` / `CouponScope` / `CouponStatus` / display status | `platform, seller` / `percent, fixed` / `all, seller, category` / `active, inactive` / `scheduled, active, expired, inactive` | SPEC 19 |
| `AuditActorType` / `AuditTargetType` / `AuditAction` | `admin, cli` / 18 target types / one per audited action (spec 20 §2.3) | VERIFIED |
| Finance | accounts + `seller_pending, customer_refund_payable, platform_promotions`; entries + `seller_net_held, seller_net_released, seller_net_reversed, commission_reversed, promotion_funded, promotion_reversed, return_fee_charged, return_fee_earned, customer_refund_owed, customer_refund_paid`; references + `return, refund, seller_order_hold` | SPEC 12 §8.1 |

### 11.6 Realtime contract (no REST; `docs/realtime.md` in the backend) [SPEC 15]

- URL: the api host with Socket.IO `path: '/realtime'` (locally `ws://localhost:3001`), WebSocket transport only, `auth: { token: <access JWT> }` read at every (re)connect, `Origin` in `CORS_ALLOWED_ORIGINS`.
- Messages (event name = `type`, argument = `{ type, eventId, occurredAt, data }`, ids and statuses only): `order.updated`, `seller_order.placed`, `seller_order.updated`, `shipment.updated` (`kind`), `shipment.assigned`, `shipment.unassigned`, `payment.updated`, `return.updated`, `media.updated`, `support.message_created`, `support.ticket_updated`, `support.typing`, `notification.created`, `session.ended { reason }`. Duplicates dropped by `eventId` + `type`.
- Client signals: `ticket.subscribe` / `ticket.unsubscribe { ticketId }` (ack `{ ok }` or a code), `support.typing { ticketId }`; 5 signals/s per socket.
- The server disconnects at the token's `exp` (`token_expired`); Socket.IO does not reconnect after a server disconnect, the client must.

### 11.7 OpenAPI findings for Release 2 (to confirm on the pulled snapshot in T-J1)

| # | Finding | Consequence |
|---|---|---|
| OA-R2-1 | `__atLeastOneField` phantom property on the new PATCH DTOs (`EditReviewDto`, `UpdateProductImageDto`, coupon updates) [VERIFIED] | Removed by the OA-5 rule (15 schemas at `ecbcd19`) |
| OA-R2-2 | Resolved: the pinned snapshot documents both `200` and `202` for `POST /media/uploads/{mediaId}/complete` [VERIFIED T-J1] | None |
| OA-R2-3 | `POST /support/tickets` documents `CustomerOpenTicketDto` only; sellers send `SellerOpenTicketDto` [VERIFIED] | No correction needed (T-J1): a seller body (no `orderId`) fits the documented type; the seller app never sends `orderId` (spec 02 SE-25) |
| OA-R2-4 | Errors of several new operations are missing from their summaries (customer reviews, seller images, seller reviews) [VERIFIED] | Error unions from §11.4 (spec), as for OA-3 |
| OA-R2-5 | `RegisterPushSubscriptionDto` has `expirationTime` (accepted and ignored, NO-23) [VERIFIED] | Send `PushSubscription.toJSON()` as it is |
| OA-R2-6 | Nullable image fields (`primaryImage`, `image`, `reply`, …) likely documented as optional like OA-1 [ASSUMPTION] | T-B7 contract suite checks the runtime `null`s |
| OA-R2-7 | 22 R2 request fields are `@Nullable()` in the backend DTOs but documented as optional only (images `variantId` / `altText`, review `title` / `body`, coupon `maxDiscount` / `globalLimit` / `scopeCategoryId` / `scopeSellerId`, push `expirationTime`, `AssignTicketDto.adminUserId`) [VERIFIED T-J1 against backend source] | Added to `NULLABLE_REQUEST_FIELDS` in `openapi-fix.ts` |
| OA-R2-8 | `AssignTicketDto.adminUserId` is required (an admin or `null` to unassign) but documented optional [VERIFIED T-J1] | OA-6 rule generalised to `REQUIRED_REQUEST_FIELDS` |
| OA-R2-9 | `AuthTokensDto.refreshToken` is now `string | null` (null only with the web cookie transport) [VERIFIED T-J1] | `@nile/auth` `bodyTokens()` fails closed on null; the BFF never selects the cookie transport |
| OA-R2-10 | `UploadFormDto.fields` is documented `{ type: object }` without keys, so it generates `Record<string, never>` (and a closed contract validator); the backend sends the presigned form fields as strings [SPEC 14 §4, VERIFIED T-J4] | `openapi-fix.ts` `STRING_MAP_FIELDS`: `additionalProperties: { type: string }` |

### 11.8 Gaps and questions (Release 2)

| Id | Gap / question | Recommendation |
|---|---|---|
| OQ-17 | Socket handshake and storage bucket CORS accept only `CORS_ALLOWED_ORIGINS` | Backend env lists the four web origins (`http://localhost:4100…4103` locally) |
| OQ-18 | Notification `link` values assume one prefixed web app (NO-12, NO-31…NO-35) | Frontend link map per app (FR2-Q4); ask the backend to treat the link list as a contract |
| OQ-19 | The local container predates R2-P6/P7 | Rebuild api, worker and realtime at `ecbcd19` before T-J1 |
| OQ-20 | Release 2 admin and realtime traffic also reaches the backend from the BFF's IP (OQ-1); sockets connect from browsers, so they are keyed per user IP | No change; OQ-1 still blocks production |
| OQ-21 | No endpoint lists a customer's refunds outside the order and return views | Not needed for R2 screens (order detail and return detail carry them) |
| OQ-22 | No "reviewed" marker on order items: the order page can't tell which items were reviewed | Use `GET /me/reviewable-items` as the source of "can review" (it leaves out reviewed products) |
| OQ-23 | The admin can't read a return's COD payout details from the return, only from the refund (`GET /admin/payments/refunds/{id}`) | As designed (spec 18 §4); AD return detail links to the refund |
