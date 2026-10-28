# Workflows — what each role can do with the current API

Status: **DRAFT v0.2 (2026-10-14), for review.** §6 (2026-10-23, T-J0): Release 2 workflows. v0.2: decisions FQ-1, FQ-2, FQ-6 and the invite flow (architecture §5.7) applied. Labels ([VERIFIED], [SPEC], [ASSUMPTION], [OPEN]) and question ids (OQ-n, FQ-n) are defined in `api-inventory.md` §0 and `architecture.md` §11.

Rules that apply to every workflow:
- The backend decides. The UI never computes prices, stock, permissions or state transitions on its own; it shows what the API returns and offers only the actions the API documents for the current state. The one client-side computation the API requires is `expectedTotal` at checkout (C-6, OQ-15).
- Action availability is derived from the **returned status** using the state machines below; the server still rejects an invalid transition (`*_INVALID_STATUS_TRANSITION` 409), which the UI handles by refetching.
- Every mutation that needs an `Idempotency-Key` keeps one key per user intent (api-inventory §4).
- Lists are cursor-paginated with no totals (api-inventory §3).

---

## 1. Visitor and customer

### C-1 Browse and search the catalog (public) [VERIFIED endpoints]
1. Category navigation: `GET /categories` (active tree, max depth 3). Category pages are addressed by slug; the id is resolved from the tree (no category-by-slug endpoint).
2. Product listing: `GET /products` with `q`, `categoryId[eq]` (includes descendants), `price[gte|lte]`, `inStock[eq]`, `sellerId[eq]`, `attr.<code>[in]`, `sort` (`-publishedAt` default, `minPrice`/`-minPrice`, `-relevance` with `q`), `limit`, `cursor`.
3. Attribute facets for a category: `GET /categories/:id/attributes` (own + inherited; option codes are the filter values). Max 5 attribute filters, 20 values each; they require `categoryId`.
4. Product detail: `GET /products/:idOrSlug` → description, category path (breadcrumbs), seller, `attributes` (only options used by active variants), active `variants` with `price`, `compareAtPrice`, `options`, `inStock`, `availableQuantity` (≤ 99, live).
5. Variant picker: the user picks one option per attribute; the matching variant is the one whose `options` match exactly. A category with no attributes has one default variant with `options: []`.
- No images (R1). No reviews, ratings, wishlist (R2). Seller storefront = `GET /products?sellerId[eq]=…` (there is no public seller profile endpoint; the business name comes with each product).
- Hidden/deleted/suspended-seller products → `404 PRODUCT_NOT_FOUND`.

### C-2 Register, verify email, log in [VERIFIED]
1. `POST /auth/register/customer` `{ email, password, firstName, lastName, phone }` → `201`, no tokens, OTP emailed.
2. `POST /auth/email/verify` `{ email, otp }` → tokens (logged in). Resend: `POST /auth/email/resend-otp` (generic 200; server cooldown 60 s → UI shows a 60 s countdown).
3. Login later: `POST /auth/login`. `EMAIL_NOT_VERIFIED` → route to step 2 with the email prefilled.
4. Forgot password: `POST /auth/password/forgot` (generic 200) → `POST /auth/password/reset` `{ email, otp, newPassword }` → `204`, then login.
5. Logout: `POST /auth/logout` with the refresh token.
- Login is role-agnostic: the same form logs in all four roles; the returned `user.role` decides where the user lands (architecture.md §4).

### C-3 Profile and addresses (customer) [VERIFIED]
- `GET /me`, `PATCH /me` (`firstName`, `lastName`, `phone`; email is immutable).
- Addresses: `GET /me/addresses` (≤ 20, default first), `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id`.
  - The first address, or any address created while there is no default, **becomes the default regardless of `isDefault`** [SPEC 04 C-3].
  - Setting `isDefault: true` moves the default. Sending `isDefault: false` on the default → `422 DEFAULT_ADDRESS_UNSET_NOT_ALLOWED` (the UI should not offer "unset default").
  - Deleting the default leaves **no** default.
  - Governorate select from `GET /governorates`; non-deliverable ones (`deliveryFee: null`) may be saved but checkout rejects them → mark them in the picker.
- Change password: `POST /auth/password/change` (needs the current refresh token; other sessions are revoked).

### C-4 Cart [VERIFIED]
- `GET /cart` → grouped by seller, with live price and stock. Empty cart: `id: null`, `sellers: []`, `itemsTotal "0.00"`.
- Add: `POST /cart/items` `{ variantId, quantity }` → `201 CartDto` (adding an existing variant **sums** quantities; result ≤ 99 and ≤ sellable).
- Change: `PATCH /cart/items/:itemId` `{ quantity }` (absolute). Remove: `DELETE /cart/items/:itemId`. Empty: `DELETE /cart`.
- Line `issue`: `UNAVAILABLE` (can only be removed; changing quantity → `422`), `OUT_OF_STOCK`, `INSUFFICIENT_STOCK` (`availableQuantity` says how many). Issue lines are **excluded** from `subtotal`, `itemsTotal`, `itemCount`; `hasIssues` blocks checkout.
- Limits: 1..99 per line, 50 lines (`CART_LINE_LIMIT_REACHED`).
- Cart requires login (customer role). **There is no guest cart** [VERIFIED: all `/cart` routes are `customer`]. **Decided (FQ-6):** a visitor pressing "Add to cart" goes to login (or registration) and comes back to the same product with the chosen variant and quantity preselected; they press "Add to cart" again. Nothing is stored client-side and nothing is added automatically.
- No `Idempotency-Key` on adds: a retried add may double the quantity; the UI should not auto-retry `POST /cart/items` on ambiguous failures (refetch the cart instead) [SPEC 08 CT-5].

### C-5 Delivery address and fee [VERIFIED]
- The delivery fee is per governorate of the chosen address: `GET /governorates` → `deliveryFee` (string) or `null` (not deliverable). Charged once per checkout, whatever the number of sellers.

### C-6 Checkout [VERIFIED endpoint, SPEC 09 rules]
1. Preconditions in UI: logged-in customer, cart without issues, an address in a deliverable governorate, a payment method (`cod` | `kashier`).
2. Show the total: `expectedTotal = cart.itemsTotal + governorate.deliveryFee`, computed with **decimal arithmetic** (never JS floats) [OQ-15].
3. `POST /checkout` `{ addressId, paymentMethod, expectedTotal }` + `Idempotency-Key` → `201 { order: OrderDetailDto, kashier: { checkoutUrl|null, expiresAt } | null }`. The cart is emptied server-side.
4. Error recovery:

| Error | UI action |
|---|---|
| `CART_EMPTY` 422 | Back to cart |
| `CART_HAS_ISSUES` 409 | Refetch cart, highlight lines (variant ids in details) |
| `INSUFFICIENT_STOCK` 409 | Refetch cart; show available quantities from details |
| `ORDER_TOTAL_CHANGED` 409 | Refetch cart + governorates, show the new total, ask to confirm again (**new idempotency key**: the body changes) |
| `ADDRESS_NOT_FOUND` 422 / `GOVERNORATE_NOT_DELIVERABLE` 422 | Back to address step |
| `ORDER_PAYMENT_PENDING` 409 (Kashier) | Link to the pending order (`details[0].value`) to pay or wait for expiry |
| `RATE_LIMITED` 429 (10/min/user) | Countdown from `Retry-After` |
| network error / 5xx / `IDEMPOTENCY_REQUEST_IN_PROGRESS` | Retry with the **same** key; a replay returns the original `201` |

5. COD: order is `placed` at once → confirmation page (order number, per-seller split).
6. Kashier: order `pending_payment` for 15 min, stock held. Redirect to `kashier.checkoutUrl`. If it is `null` (Kashier failed at checkout), call `POST /orders/:id/payment/kashier-session` → `{ checkoutUrl, expiresAt }` (same session on every call; `PAYMENT_PROVIDER_UNAVAILABLE` 502 → retry later; `ORDER_NOT_AWAITING_PAYMENT` 409 → the window is over).
7. Return from Kashier: lands on `/checkout/payment-return` (`KASHIER_REDIRECT_URL`, recommendation OQ-2). The page finds the order from the id saved before the redirect (fallback: the newest `pending_payment`/`placed` order), **never trusts the redirect query**, and polls `GET /orders/:id` until `status` leaves `pending_payment` (webhook wins) or `paymentExpiresAt` passes, then shows placed / cancelled. [SPEC 09 OR-11]
- A payment declined at Kashier leaves the payment `initiated`; the customer can retry inside the window. After expiry the order is cancelled and stock released. A payment arriving after expiry is refunded manually by an admin (order stays cancelled).

### C-7 My orders [VERIFIED]
- `GET /orders` (filters `status[eq|in]`, `createdAt[gte|lte]`; sort `createdAt`) → `OrderSummaryDto` (number, status, method, total, itemCount, sellerOrderCount).
- `GET /orders/:id` → `OrderDetailDto`: totals, `paymentStatus`, shipping address, seller orders each with status, items (with `cancelledQuantity`), **timeline** (`{status, at}[]`), `canCancel`.
- Order status meaning (derived server-side): `pending_payment` (Kashier unpaid) → `placed` (all active seller orders placed) → `in_progress` → `completed` | `partially_completed` | `cancelled`.
- Totals change after cancellations: `itemsTotal` counts only seller orders not cancelled/returned; `deliveryFee` becomes `0.00` if nothing is delivered.
- Tracking is per seller order (one shipment each); there is no shipment/agent info in the customer DTO and no live tracking.

### C-8 Cancel a seller order (customer) [VERIFIED]
- Allowed only when that seller order is `placed` (before the seller accepts) and the order is not `pending_payment`; the API exposes this as `canCancel`. Whole seller order only (item-level cancel is seller-only).
- `POST /orders/:orderId/seller-orders/:sellerOrderId/cancel` `{ note? }` + `Idempotency-Key` → `200 OrderDetailDto`. `SELLER_ORDER_NOT_CANCELLABLE` 409 → refetch (seller accepted meanwhile).
- Kashier-paid: the refund is manual by an admin; the UI states that a refund will be processed (no refund status is exposed to the customer beyond `paymentStatus`, e.g. `partially_refunded_manually`).

---

## 2. Seller

Seller status gates everything: `pending_approval` → `approved` | `rejected`; `approved` ⇄ `suspended`; `rejected` → (edit + re-apply) → `pending_approval`.

### S-1 Register and onboarding [VERIFIED]
1. `POST /auth/register/seller` `{ email, password, businessName, contactPhone, pickupAddress{governorateId, city, area, street, building, landmark?} }` → `201` (`status: pending_email_verification`, `sellerStatus: pending_approval`).
2. Verify email (same as C-2) → logged in.
3. Waiting room: `GET /seller/profile` shows `status`. While `pending_approval`/`rejected`/`suspended`, catalog **writes** are refused (`403 SELLER_NOT_APPROVED`); reads work. The seller app should show a status banner and disable write actions.
4. Rejected: show `rejectionReason`; seller edits (`PATCH /seller/profile`) and re-applies (`POST /seller/profile/reapply`).
- Admin approval also requires a verified email (admin side, AD-2).

### S-2 Profile [VERIFIED]
`GET/PATCH /seller/profile` (`businessName`, `contactPhone`, `pickupAddress` replaced whole). Editable in any status, no re-approval, affects new orders only.

### S-3 Products and variants [VERIFIED]
- List: `GET /seller/products` (`status[eq|in]`, `categoryId[eq]`, `name[like]`, `createdAt`).
- Create draft: `POST /seller/products` `{ categoryId, name, description }`. Category must be active. Slug is generated and immutable.
- Detail: `GET /seller/products/:id` → product + variants with `stock { onHand, reserved, sellable }`.
- Edit: `PATCH` `name`, `description`, `categoryId` (category only while there are no variants → `PRODUCT_CATEGORY_LOCKED`).
- Variants: `POST /seller/products/:id/variants` `{ sku, price, compareAtPrice?, optionIds[], initialStock, status }`. `optionIds` must contain **exactly one option per effective attribute** of the category (`GET /categories/:id/attributes`); a category without attributes allows one default variant with `optionIds: []`. Options are immutable afterwards (delete and recreate).
- Variant edit: `PATCH …/variants/:variantId` (`sku`, `price`, `compareAtPrice` nullable, `status`). Delete: `DELETE`.
- Publish: `POST …/activate` (draft|inactive → active; needs ≥ 1 active variant). Unpublish: `…/deactivate`. Deleting/deactivating the last active variant auto-deactivates the product.
- `visible` on the product = live on the storefront (false while the seller is suspended).
- Delete product: soft, `DELETE /seller/products/:id`.
- Limits: ≤ 100 variants per product, ≤ 5 effective attributes.

### S-4 Stock [VERIFIED]
- Adjust by **delta** (never absolute): `POST /seller/variants/:variantId/stock-adjustments` `{ delta }` (±1..100000, ≠ 0) + `Idempotency-Key` → `{ onHand, reserved, sellable }`. `STOCK_ADJUSTMENT_INVALID` if the result would be negative or below `reserved`.
- History: `GET /seller/variants/:variantId/stock-movements` (newest first).
- UX note: a "set stock to N" input must be converted to a delta **against the freshly fetched `onHand`** and shown as a delta before submitting; the backend chose deltas because `onHand` includes picked-up-not-delivered parcels [SPEC 06 UC-CA-5].

### S-5 Fulfil seller orders [VERIFIED]
- List: `GET /seller/orders` (`status[eq|in]`, `createdAt`); `pending_payment` orders never appear. No customer PII: only `dropoffGovernorate`.
- Actions by status:

| Status | Seller actions |
|---|---|
| `placed` | accept · cancel · cancel item quantities. **Auto-cancel 24 h after placement** (`acceptDeadlineAt` → countdown) |
| `accepted` | mark ready · cancel · cancel items |
| `ready_for_pickup` | cancel · cancel items (an agent is being assigned) |
| `picked_up`, `out_for_delivery`, `delivery_failed` | none (agent side) |
| `returning_to_seller` | confirm return received |
| `delivered`, `cancelled`, `returned_to_seller` | none (terminal) |

- Endpoints: `POST /seller/orders/:id/accept`, `/ready`, `/cancel` `{ note? }` (idem), `/items/:itemId/cancel` `{ quantity, reason, note? }` (idem; cancelling all open units cancels the seller order), `/return-received` (idem).
- Money shown per seller order: `subtotal`, `commissionRate`, `commission`, `sellerNet` (snapshotted).
- New-order awareness is polling only (OQ-10, OQ-13).

### S-6 Finance (read-only) [VERIFIED]
`GET /seller/finance/balance` (`balance`, `updatedAt|null`), `GET /seller/finance/entries` (ledger statement), `GET /seller/finance/payouts`. Credited on `delivered`; payouts are made outside the system and recorded by an admin.

---

## 3. Delivery agent

Accounts are created by an admin; the agent receives an emailed invite.

### A-1 Onboarding and session [VERIFIED]
1. Invite link `INVITE_URL_BASE?token=<43 chars>` opens the neutral storefront `/invite` page → set password → `POST /auth/invite/accept` server-side → the session is discarded at once → redirect to the agent app login → sign in (architecture §5.7). Admin invites follow the same path into the admin app.
2. `GET /agent/profile` (works in any status). `status: inactive` → every other agent endpoint returns `403 AGENT_INACTIVE`; a deactivated agent's login is also suspended.

### A-2 Shift [VERIFIED]
`PATCH /agent/availability` `{ onShift }`. Off shift keeps current shipments, only stops new auto-assignments. Inactive agent → `AGENT_INACTIVE` (status code ambiguous, OQ-12).

### A-3 Work shipments [VERIFIED]
- List: `GET /agent/shipments` — without a status filter it returns the **active** ones (`assigned, picked_up, out_for_delivery, delivery_failed, returning_to_seller`), oldest first; history via `status[in]=delivered,…`.
- Detail: pickup (seller business name, phone, address) and dropoff (recipient name, phone, full address), `amountToCollect`, attempts.
- Transitions:

| From | Action | Endpoint | Idem |
|---|---|---|---|
| `assigned` | picked up | `POST …/picked-up` | – |
| `picked_up`, `delivery_failed` | out for delivery | `POST …/out-for-delivery` (response shows `amountToCollect`, which may now include the delivery fee) | – |
| `out_for_delivery` | delivered | `POST …/delivered` `{ codCollectedAmount }` (COD: **must equal** `amountToCollect`; Kashier: omit) | required |
| `out_for_delivery` | failed attempt | `POST …/failed-attempt` `{ reason, note? }` (`customer_refused` or 3rd attempt → `returning_to_seller`) | required |
| `returning_to_seller` (seller order cancelled after pickup only) | handed back | `POST …/returned` | required |

- Agents cannot reject assignments. New assignments arrive only by polling (OQ-10).

### A-4 Finance (read-only) [VERIFIED]
`GET /agent/finance/balances` (`feePayable`, `codCashHeld`), `GET /agent/finance/entries?account=fee|cod`, `GET /agent/finance/remittances`.

**Decided (FQ-2):** agents get a mobile-first web app (`apps/agent`), built in phase h (T-H12).

---

## 4. Admin

The first admin is created by a CLI on the backend; further admins are invited (AD-1).

### AD-1 Admin accounts [VERIFIED]
- Invite: `POST /admin/admins` `{ email }`; list: `GET /admin/admins`.
- Resend invite: `POST /admin/users/:userId/resend-invite` (invited admins only; agents' `userId` isn't exposed, OQ-7: gap accepted for R1).
- Suspend / reactivate: `POST /admin/users/:userId/suspend` `{ reason }` / `…/reactivate`. Customers and admins only, `active ⇄ suspended`, not self. **Customers' `userId` is not discoverable through the API (OQ-7)** → buildable for admins only.

### AD-2 Sellers [VERIFIED]
- List `GET /admin/sellers` (`status`, `businessName[like]`, `pickupGovernorateId`, `createdAt`); detail with status and commission history (last 50).
- Decisions: approve (needs verified email, else `SELLER_EMAIL_NOT_VERIFIED`), reject `{ reason }`, suspend `{ reason }` (hides products; open orders continue), reinstate `{ reason? }`.
- Commission: `PUT /admin/sellers/:id/commission-rate` `{ commissionRate }` (new checkouts only); default rate: `GET/PUT /admin/settings/commission`.

### AD-3 Catalog structure [VERIFIED]
- Tree `GET /admin/categories` (incl. inactive, own attributes and options).
- Category create `{ parentId?, name, slug?, sortOrder }` (depth ≤ 3, ≤ 100 children), update (`name`, `slug`, `sortOrder`, `isActive`); no move, no delete. Deactivate only without active children or products; activate only under an active parent.
- Attributes: add to a category `{ name, code, sortOrder }` — **only while its subtree has no products**; `code` immutable and must not clash in lineage/subtree; ≤ 5 effective. Update `name`, `sortOrder`; delete only when unused.
- Options: add `{ value, code, sortOrder }` any time (≤ 100); update `value`, `sortOrder`; delete only when no variant uses it.

### AD-4 Delivery setup [VERIFIED]
- Governorate fees: `GET /admin/governorates`, `PATCH /admin/governorates/:id` `{ deliveryFee: "50.00" | null }` (null = not deliverable; new checkouts only). All 27 start non-deliverable.
- Agent fee share: `GET/PUT /admin/settings/delivery` `{ agentFeeShareRate }`.

### AD-5 Delivery agents and shipments [VERIFIED]
- Agents: create `{ email, fullName, phone, homeGovernorateId }` (invite emailed), list (`status`, `onShift`, `homeGovernorateId`, `fullName[like]`), detail, edit, deactivate (needs no active shipments; suspends login), activate.
- Shipments: list (`status`, `agentId`, `orderId`, `createdAt`), detail with attempts and history, assign/reassign `{ agentId }` only in `unassigned`/`assigned` (target must be active; may be off shift or another governorate).
- Operational queue: `GET /admin/shipments?status[eq]=unassigned`.

### AD-6 Orders and payments [VERIFIED]
- Orders: list (`status`, `orderNumber[eq]`, `customerId[eq]`, `createdAt`), detail with per-seller-order money and full status histories. **No admin cancellation** (S-9).
- Payment of an order: `GET /admin/orders/:orderId/payment` (refunds, webhook events without payloads); by id `GET /admin/payments/:id`.
- Refund work queue: `GET /admin/payments/refunds?status[eq]=pending_manual` (oldest first). After refunding in the Kashier dashboard: `POST /admin/payments/refunds/:refundId/record` `{ providerRefundRef }` + `Idempotency-Key`.

### AD-7 Finance [VERIFIED]
- Accounts: `GET /admin/finance/accounts` (`accountType`, `ownerId`, `balance[gt|gte]`; default sort `-balance`), detail, statement `…/entries`.
- Reference lookup: `GET /admin/finance/entries?referenceType=…&referenceId=…` (both required, unpaginated).
- COD remittance (agent hands in cash): `POST /admin/finance/cod-remittances` `{ agentId, amount, note? }` + key; list.
- Payout (paid outside the system): `POST /admin/finance/payouts` `{ payeeType: seller|agent, payeeId, amount, externalReference, paidAt }` + key (`paidAt` not in the future); list.
- Suggested screens: "agents holding COD cash" = accounts `accountType[eq]=agent_cod_cash&balance[gt]=0`; "who is owed" = `seller_payable` / `agent_fee_payable` with `balance[gt]=0`.

---

## 5. Cross-role journeys (end to end)

```
customer checkout ─► seller order placed ─(seller accepts ≤24h)─► accepted ─(ready)─► ready_for_pickup
   │                                        └─(no accept in 24h)─► cancelled (system)
   └─ Kashier: pending_payment ≤15 min ─(webhook paid)─► placed │ (expired/failed) ─► cancelled
ready_for_pickup ─► shipment auto-assigned (or admin assigns) ─► agent picked_up ─► out_for_delivery
   ─► delivered  (COD cash collected → agent COD balance → admin confirms remittance)
   ─► failed attempt ×≤3 / refused ─► returning_to_seller ─► seller confirms ─► returned_to_seller
delivered ─► ledger: seller net, commission, agent fee share ─► admin records payouts
```

Each role sees only its own slice; nothing in the API lets one role see another's live state beyond what is listed above.

---

## 6. Release 2 workflows (backend `ecbcd19`, T-J0, 2026-10-23)

Labels as above; endpoint details in `api-inventory.md` §11. Release 2 workflows are added here, never renumbered; R1 workflows that changed get an "(R2)" addition.

### 6.1 All roles

#### X-1 Upload an image [VERIFIED, SPEC 14]
1. `POST /media/uploads { purpose, contentType, sizeBytes }` → `201 { media (pending), upload { url, fields, expiresAt } }`. Purposes by role: seller `product_image`, admin `category_image`, customer `review_image`, customer and seller `return_photo`, all three `support_attachment`.
2. The **browser** posts the file straight to storage: a multipart form to `upload.url` with every `fields` entry, the file last (presigned; ≤ 5 MB, jpeg / png / webp, ≥ 200 × 200). The URL expires after 5 min.
3. `POST /media/uploads/{mediaId}/complete` → `202` `processing` (`200` when already processing / ready). `MEDIA_UPLOAD_MISSING` → the file hasn't reached storage yet: retry until the URL expires.
4. Wait for `ready`: socket `media.updated`, or `GET /media/{mediaId}` polling. `failed` + `failureReason` → say why; the user picks another file.
5. Only a `ready` media id can be attached (product image, review, ticket message, return, dispute); unattached uploads are deleted after 24 h. Max 20 open uploads per user, 30 upload requests per 10 min.

#### X-2 Notifications and push [VERIFIED, SPEC 13 §8]
1. Bell: `GET /me/notifications/unread-count` (capped at 100), list `GET /me/notifications` (filters `read`, `category`), `POST …/{id}/read`, `POST …/read-all`. Each item has a `link` to a web route written for one prefixed app; each app maps it (FR2-Q4).
2. Preferences: `GET /me/notification-preferences` (four categories, push only; in-app is always on), `PUT` with only the changed categories.
3. Web Push: `GET /push/config` → VAPID public key → `PushManager.subscribe` (after a user gesture) → `POST /me/push-subscriptions` (the `toJSON()` body). Before sign-out: `POST /me/push-subscriptions/unregister { endpoint }`. A password reset or a suspension removes every subscription server-side.
4. Texts carry order and ticket numbers only (no names, addresses, amounts).

#### X-3 Live updates (realtime) [SPEC 15, backend `docs/realtime.md`]
1. Connect with the access token (FR2-Q1: fetched from the app's BFF), WebSocket only, from an allowed `Origin`.
2. On each message: drop duplicates (`eventId` + `type`), then refetch what the screen shows (messages carry ids and statuses only).
3. `session.ended` `token_expired` → refresh the session, reconnect. After any reconnect, refetch everything on screen. `account_suspended`, or a refused reconnect after a failed refresh → sign out.
4. Support threads: `ticket.subscribe { ticketId }` while the thread is open; `support.typing` signals.

#### X-4 Support ticket (customer, seller) [VERIFIED, SPEC 16]
1. Open: `POST /support/tickets` (Idempotency-Key) `{ category, subject, body, orderId? / sellerOrderId?, attachmentMediaIds? (≤ 3) }`. Customers may link an order (optionally one of its seller orders); sellers a seller order only. `seller_onboarding` is seller-only. Max 20 open tickets.
2. List `GET /support/tickets` (`status`, `category`, sort `-lastMessageAt`) with `hasUnread`. Thread `GET …/{id}/messages` (newest first; the client reverses), post `POST …/{id}/messages` (Idempotency-Key), mark read `POST …/{id}/read`.
3. Admins appear as "Nile Support"; internal notes never reach users. A `closed` ticket takes no message (`SUPPORT_TICKET_CLOSED`): open a new one. A message on `resolved` reopens it (auto-closed 7 days after resolution).

### 6.2 Visitor and customer

#### C-1 (R2) Catalog with images and ratings [VERIFIED]
Cards gain `primaryImage` and `rating { avg, count }`; the detail gains `images` (ordered; `variants[].imageId` picks the variant's image, else the primary), product rating and seller rating; categories gain `image`. Filter `rating[gte]`, sort `-rating` (unrated last). Public seller page: `GET /sellers/{sellerId}` + `GET /products?sellerId[eq]=`.

#### C-9 Product reviews (public) [VERIFIED, SPEC 17]
`GET /products/{id}/reviews/summary` (average, count, distribution) and `GET /products/{id}/reviews` (filters `rating[eq,in]`, `hasImages`; sort `-createdAt`, `rating`). Reviewer shown as "Mona A."; the seller's reply unless hidden.

#### C-10 Wishlist [VERIFIED, SPEC 04 §8]
`GET /me/wishlist/product-ids` once per session (hearts), `PUT /me/wishlist/{productId}` (idempotent, `204`), `DELETE …` (`204`), page `GET /me/wishlist` with product cards (`available: false` kept and marked). Max 200 (`WISHLIST_LIMIT_REACHED`).

#### C-11 Write and manage reviews [VERIFIED, SPEC 17]
1. Candidates: `GET /me/reviewable-items` (delivered items inside 60 days whose product isn't reviewed).
2. `POST /reviews { orderItemId, rating 1..5, title?, body?, imageMediaIds? (≤ 4) }` → published at once. One live review per product (`REVIEW_ALREADY_EXISTS`).
3. Mine: `GET /me/reviews`; edit (`PATCH`) within 30 days (`canEdit`); delete any time, after which a new one may be written while the window is open. A hidden review shows the author its status, not the reason.

#### C-6 (R2) Checkout with a coupon [SPEC 19, 09 §8.8]
1. Optional preview: `POST /cart/coupon-preview { code }` → discount total, per seller, per line, items total after discount. Nothing is stored (20 previews per minute).
2. Checkout sends `couponCode` again; `expectedTotal` = items total − discount + delivery fee (decimal). A coupon `422` aborts the checkout: the UI removes the coupon, explains, and the shopper confirms again (new intent, new key).
3. Order views show `coupon { code, discountTotal }` and per-line `discountAmount`, `paidTotal`. Cancelling the whole checkout before any delivery frees the coupon use.

#### C-12 Return items [SPEC 18]
1. From a `delivered` seller order inside 14 days: `GET /orders/{orderId}/seller-orders/{sellerOrderId}/returnable-items` → returnable quantity and paid unit amount per item, the return fee, the window end.
2. `POST /returns` (Idempotency-Key) `{ sellerOrderId, reason, description?, items[{ orderItemId, quantity }], photoMediaIds? (≥ 1 for damaged / wrong_item / not_as_described, ≤ 4), refundPayout? (COD only: mobile wallet number or InstaPay address) }`. One reason per request; one open return per seller order. `changed_mind` deducts the return fee from the refund (`RETURN_AMOUNT_TOO_LOW` when nothing is left); seller-fault reasons cost the customer nothing. The original delivery fee is never refunded.
3. Track `GET /returns`, `GET /returns/{id}` (timeline, deadlines, estimated then final refund, refund status). Cancel (`POST …/cancel`) before pickup. Rejected → escalate (`POST …/escalate { note }`) within 7 days.
4. Lifecycle: `requested → approved (seller, silence 48 h, or admin) → picked_up → received → completed` (refund) · `rejected → escalated → approved | refused` · `received → disputed → completed | refused` · `pickup_failed` after 3 failed pickups.

#### C-13 Refund visibility [SPEC 10 §8, 18]
Card refunds are automatic (Kashier); `paymentStatus` becomes `partially_refunded` / `refunded`. COD return refunds are paid by an admin to the wallet / InstaPay given in the return. The order shows its refunds; the customer gets a "Refund issued" notification.

#### C-14 Support (customer)
X-4 with order links.

### 6.3 Seller

#### S-7 Product images [VERIFIED, SPEC 06 §8]
Upload (X-1, `product_image`), then `POST /seller/products/{id}/images { mediaId, variantId?, altText?, position? }` (max 8) → all images in order. Edit `PATCH …/images/{imageId} { variantId?, altText? }`; reorder `PUT …/images/order { imageIds }` (every id once); remove `DELETE …`. The first image is the primary. Approved sellers only. A product blocked by an admin carries `adminBlocked` + reason, and its status can't change (`PRODUCT_BLOCKED`).

#### S-6 (R2) Finance with the holding period [SPEC 12 §8]
Balance `{ available, pending }`: delivered earnings stay `pending` until the 14-day return window closes with no open return, then become `available`. `available` may be negative after a seller-fault return fee. Holds: `GET /seller/finance/holds` (`blockedByReturn`). Payouts come from `available` only. New ledger entry types (`api-inventory.md` §11.5).

#### S-8 Returns [SPEC 18]
Queue `GET /seller/returns` (sort by decision deadline), detail (no customer contact data). `requested`: approve, or reject with a reason (48 h; silence = approve). `received`: confirm receipt with a restock choice per item (Idempotency-Key; 48 h, silence = confirmed without restock), or dispute with a reason and optional photos. Seller-fault reasons charge the seller the return fee.

#### S-9 Reviews [VERIFIED, SPEC 17]
`GET /seller/reviews` (filters product, rating, replied, dates); reply once with `POST /seller/reviews/{id}/reply { body }` (approved sellers; not on hidden reviews).

#### S-10 Coupons [SPEC 19]
Approved sellers create seller-funded coupons for their own products (scope `seller`, or `category` within their products): code, percent (1–90 %) or fixed amount, maximum discount (percent), minimum eligible subtotal, dates, global and per-customer limits. After the first redemption only the end date, the global limit and the status change (`COUPON_LOCKED`). Commission is on the discounted subtotal. An admin may block a seller coupon (`COUPON_BLOCKED` on re-activation).

#### S-11 Support (seller)
X-4 with seller-order links and `seller_onboarding`.

#### S-5 (R2) Fulfilment changes
Seller orders may be cancelled by an admin (`admin_cancelled`); seller order views show the coupon discount, its funding and the returned sums.

### 6.4 Delivery agent

#### A-5 Return pickups [SPEC 11 §8]
Return shipments (`kind = return`) are auto-assigned by the customer's governorate. The agent collects at `dropoff` (the customer) and hands over at `pickup` (the seller); nothing to collect (`amountToCollect "0.00"`). Actions: picked up (from `assigned | pickup_failed`), failed attempt (`customer_unreachable, customer_refused, wrong_address, customer_rescheduled`; refused ends it, the third failure cancels it), delivered (handed to the seller, no amount). Lists filter `kind[eq]`.

#### A-6 New assignments live
`shipment.assigned` / `shipment.unassigned` (X-3) and a high-urgency push "New pickup" (X-2).

### 6.5 Admin

| Id | Workflow | Endpoints | Source |
|---|---|---|---|
| AD-8 | Dashboard figures (cached up to 60 s, `generatedAt`) | `GET /admin/dashboard` | VERIFIED, SPEC 20 §3.2 |
| AD-9 | User directory and customers (email prefix, role, status; customer name / phone; a customer's orders through `GET /admin/orders?customerId[eq]=`) | `/admin/users`, `/admin/customers*` | VERIFIED |
| AD-10 | Cancel a seller order (from `placed`, `accepted`, `ready_for_pickup`) or a whole order (all or nothing) with a reason (3..500, internal) | `/admin/seller-orders/{id}/cancel`, `/admin/orders/{id}/cancel` (Idempotency-Key) | VERIFIED |
| AD-11 | Block / unblock a product with a reason; category image set / remove | `/admin/products/{id}*`, `/admin/categories/{id}/image` | VERIFIED |
| AD-12 | Support console: queue, thread with internal notes, assign (the first public reply assigns), resolve, close | `/admin/support/tickets*` | VERIFIED |
| AD-13 | Review moderation: hide / unhide reviews and replies with a reason | `/admin/reviews*` | VERIFIED |
| AD-14 | Returns: decide `requested` / `escalated` (approve, reject; final), resolve a dispute (refund / no refund) | `/admin/returns*` | SPEC 18 |
| AD-15 | Refunds: every status; work queue `pending_manual`; detail with COD payout details; retry a Kashier refund; record a manual refund | `/admin/payments/refunds*` | SPEC 10 §8.4 |
| AD-16 | Coupons: platform coupons create / edit; seller coupons block / unblock | `/admin/coupons*` | SPEC 19 |
| AD-17 | Audit log: every admin write; filters actor, action, target, dates | `/admin/audit-log*` | VERIFIED |

### 6.6 Cross-role journeys (Release 2)

```
return:   customer requests (photos, COD payout) ─► seller approves (≤48 h, silence = approve) | rejects ─► customer escalates (≤7 d) ─► admin decides
          approved ─► return shipment auto-assigned ─► agent picks up at the customer (≤3 attempts) ─► hands over to the seller
          ─► seller confirms (restock per item, ≤48 h) | disputes ─► admin refund / no refund
          completed ─► Kashier refund automatic (retries, else manual) | COD refund paid by an admin and recorded ─► customer notified
holding:  delivered ─► seller net pending ─(14 days, no open return)─► available ─► payouts
coupon:   customer previews ─► checkout with couponCode ─► discount per seller order and item ─► whole checkout cancelled before delivery frees the use
support:  customer / seller opens ─► admins see it live ─► first admin reply assigns ─► resolve ─► 7 days ─► closed
```
