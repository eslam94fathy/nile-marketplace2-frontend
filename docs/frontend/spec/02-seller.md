# Spec 02 — Seller portal

Status: **v1.0 APPROVED (2026-10-14).** Approved by the user with every recommendation in §7 (SE-Q-1…SE-Q-8) and every [PROPOSED] item. Changes from now on need explicit approval and a version bump.
Conventions: `00-conventions.md` v1.0. Backend specs cited as [SPEC nn] = `../nile-marketplace2/docs/spec/<nn>-*.md`; [VERIFIED] = running API / OpenAPI / backend code.
App: `apps/seller`, dev port 4101. Access roles: public (auth screens), `seller`.

---

## 1. Scope

**In scope:** seller registration, email verification, sign-in, password reset; approval status and re-application; profile and pickup address; products, variants and stock; seller orders (accept, ready, cancel, item cancellation, return received); finance (balance, statement, payouts); password change.

**Out of scope (and why):**

| Item | Reason |
|---|---|
| Product images, bulk import/export | Not in the R1 API |
| Customer name, phone, address | Sellers never see customer PII, only the drop-off governorate [SPEC 09 S-11] |
| Delivery agent identity, shipment tracking | Not exposed to sellers [VERIFIED `SellerOrderDto`] |
| Payout requests, bank details | Payouts are made by an admin outside the system [SPEC 12] |
| Sales analytics, counts, charts | No endpoint; lists have no totals |
| Deleted products | The seller list excludes them [SPEC 06] |
| Orders awaiting the customer's card payment | Never shown to sellers [VERIFIED `seller-order.repository.ts`] |
| Absolute stock set | Stock changes are deltas only [SPEC 06 S-6]; a "set count to" helper converts to a delta (SE-12) |
| Push / sound notifications | No real-time channel; polling only (OQ-10) |

## 2. Global elements

### 2.1 Layout

Sidebar (desktop) / bottom sheet menu (mobile): Overview · Orders · Products · Finance · Profile · Security · Sign out. Header: business name (from `GET /seller/profile`), status badge.

### 2.2 Seller status and what it allows [SPEC 05, SPEC 06, SPEC 09, SPEC 12]

`GET /seller/profile` is loaded once per session page load and on focus; its `status` drives the banner and the controls.

| Status | Banner | Catalog writes (create/edit/delete/publish/stock) | Orders | Finance / reads |
|---|---|---|---|---|
| `pending_approval` | "Your account is waiting for approval. You can add products once you're approved." | **Disabled** (`SELLER_NOT_APPROVED` [SPEC 06 S-17]) | – (none exist) | allowed |
| `approved` | none | allowed | allowed | allowed |
| `rejected` | "Your application was rejected: {rejectionReason}. Update your profile and re-apply." + "Re-apply" (SE-07-A2) | Disabled | – | allowed |
| `suspended` | "Your account is suspended. Your products are hidden from the store. Please finish your open orders." | Disabled | **allowed** (open orders continue [SPEC 00 Q-36]) | allowed |

- Disabled controls stay visible with the banner's explanation (tooltip/inline text), so the seller knows what will be possible.
- Any `SELLER_NOT_APPROVED` (403) from a write refetches the profile and shows the banner text as a toast.

### 2.3 Route map

| Route | Screen | Access |
|---|---|---|
| `/login` | SE-01 Sign in | public |
| `/register` | SE-02 Register | public |
| `/verify-email` | SE-03 Verify email | public |
| `/forgot-password`, `/reset-password` | SE-04, SE-05 | public |
| `/` | SE-06 Overview | seller |
| `/profile` | SE-07 Profile & status | seller |
| `/products` | SE-08 Products | seller |
| `/products/new` | SE-09 New product | seller (approved) |
| `/products/[productId]` | SE-10 Product | seller |
| `/products/[productId]/variants/[variantId]/stock` | SE-13 Stock history | seller |
| `/orders` | SE-14 Orders | seller |
| `/orders/[sellerOrderId]` | SE-15 Order | seller |
| `/finance` | SE-16 Finance | seller |
| `/security` | SE-17 Security | seller |

All portal pages: shell + client rendering, `no-store`, `noindex`.

---

## 3. Authentication screens

The auth screens behave like the storefront's (spec 01 SF-10…SF-14) with these differences:

### SE-01 Sign in
- Accepts only `role = seller`. Another role → session discarded by the BFF; message "This is a {customer/admin/delivery} account. Please use the {store/admin/delivery} site." with a link from config. `deviceName` = "Web (seller)".
- Success → `returnTo` or `/`.
- `EMAIL_NOT_VERIFIED` → `/verify-email?email=…`. `INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED` as SF-10. Note: a **seller** suspension (business status) does not block login [SPEC 05]; `ACCOUNT_SUSPENDED` only appears for a suspended user account.

### SE-02 Register

Fields [VERIFIED `RegisterSellerDto`, `PickupAddressInput`]:

| Field | Rules |
|---|---|
| Business name | required, trimmed, 2..150; unique case-insensitively (`BUSINESS_NAME_TAKEN`) |
| Contact phone | required, Egyptian mobile (conventions §5) |
| Email | required, email, ≤ 254 |
| Password / Confirm password | as SF-11 |
| Pickup address: Governorate | required, select of all 27 governorates (`GET /governorates`; a pickup governorate doesn't need a delivery fee) |
| City / Area | required, 1..100 each |
| Street | required, 1..200 |
| Building | required, 1..50 |
| Landmark | optional, 1..200 (omitted when empty) |

Help text: "Delivery agents collect your parcels from this address." [SPEC 00 §4.6].
Action: `POST /auth/register/seller` → `201` (no tokens) → `/verify-email?email=…` with "After verifying your email, our team will review your application."
Errors: `EMAIL_ALREADY_REGISTERED` (email field), `BUSINESS_NAME_TAKEN` (business name field: "This business name is already taken."), `GOVERNORATE_NOT_FOUND` (refetch governorates, field error).

### SE-03 Verify email
As SF-12; on success → `/` (Overview shows "waiting for approval").

### SE-04 Forgot password / SE-05 Reset password
As SF-13 / SF-14, within the seller app.

---

## 4. Portal screens

### SE-06 Overview

Route: `/` · Data (parallel): `GET /seller/profile`; `GET /seller/orders?status[eq]=placed&sort=createdAt&limit=5`; `GET /seller/orders?status[eq]=returning_to_seller&sort=createdAt&limit=5`; `GET /seller/finance/balance`. Refetch the order lists every 60 s while visible (api-inventory §10.4) [PROPOSED content, SE-Q-1].
Content:
1. Status banner (§2.2). For `pending_approval`: a checklist "Email verified ✓ · Waiting for admin review".
2. "Orders to confirm" — up to 5 `placed` orders, oldest first, each with order number, item count, subtotal and the **acceptance countdown** to `acceptDeadlineAt` ("Confirm within 5 h 12 min"); "See all" → `/orders?tab=to-confirm`. Empty: "No orders waiting for you."
3. "Returns to confirm" — up to 5 `returning_to_seller` orders; hidden when empty.
4. Balance card: "Nile owes you {balance}" (`"0.00"` and `updatedAt: null` → "No earnings yet. Earnings are added when an order is delivered.") → link `/finance`.
5. Shortcuts: "Add product" (approved only), "Orders", "Products".
Acceptance:
1. Countdowns come from `acceptDeadlineAt` (server time), and the list refetches when a countdown reaches zero.
2. No counts are shown (the API has none).

### SE-07 Profile and status

Route: `/profile` · Data: `GET /seller/profile`, `GET /governorates`.
Content:
1. Status section: status badge, `approvedAt` ("Approved on …"), `rejectionReason` when rejected, commission: "Nile's commission: {rate as percent}" (e.g. `"0.1000"` → "10%", `"0.1250"` → "12.5%") with "Commission is charged on item prices only, not on the delivery fee." [SPEC 00 Q-6].
2. Business details form (A1).
3. Email (read-only).

**A1 Save profile** — allowed in **any** status, no re-approval needed [SPEC 05 S-7]; note under the form: "Changes apply to new orders only."

| Field | Rules |
|---|---|
| Business name | 2..150 |
| Contact phone | Egyptian mobile |
| Pickup address (governorate, city, area, street, building, landmark) | as SE-02; landmark cleared → `null` |

`PATCH /seller/profile` with only the changed top-level fields; if any address field changed, the **whole** `pickupAddress` object is sent (it is replaced as a whole [SPEC 05]). → `200 SellerProfileDto` → cache updated → toast "Profile saved."
Errors: `BUSINESS_NAME_TAKEN`, `GOVERNORATE_NOT_FOUND`.

**A2 Re-apply** — only when `status = rejected`: dialog "Send your application for review again? Make sure your details are up to date." → `POST /seller/profile/reapply` → `200` → status `pending_approval`, banner changes. `SELLER_INVALID_STATUS_TRANSITION` → refetch profile.
Acceptance:
1. The pickup address is always sent complete when it changes.
2. Re-apply is offered only to rejected sellers.

### SE-08 Products

Route: `/products?status=&category=&name=` · Data: `GET /seller/products` (`limit=20`, sort `-createdAt`), `GET /categories` (names for `categoryId`).
Filters (URL ↔ API): status tabs All / Draft / Active / Inactive (`status[eq]`); category select (`categoryId[eq]`, from the public tree); name search (`name[like]`, 1..200 chars, debounced 400 ms) [PROPOSED].
Row: name (link SE-10), status badge, "Visible in store" / "Hidden" (`visible`), category name, price range (`minPrice`–`maxPrice`, "—" when null: no variants), "Out of stock" when `inStock = false` and the product has variants, created date.
- Category name: looked up in the public tree; a product whose category is no longer active shows "Unavailable category" [VERIFIED: sellers have no access to inactive categories; SE-Q-2].
- "Add product" button (approved only) → `/products/new`.
States: empty (no filter) → "You haven't added any products yet." + "Add product" (approved) or the status banner text (not approved).

`visible` explanation (tooltip): "Shown in the store when the product is published and your account is approved." (visible = product `active` + seller approved + not deleted [SPEC 06 VIS]). An out-of-stock visible product is still shown in the store, marked "Out of stock".

### SE-09 New product

Route: `/products/new` · Access: approved sellers (others are redirected to `/products` with the banner) · Data: `GET /categories`.
Fields [VERIFIED `CreateProductDto`]:

| Field | Rules |
|---|---|
| Category | required; a tree picker of active categories at **any** level (products can attach to any level [SPEC 00 Q-30]). Under the picker: the attributes this category requires for variants, from `GET /categories/{id}/attributes` ("Variants will need: Size, Color"), or "This category has no options: the product will have a single variant." |
| Name | required, trimmed, 2..200 |
| Description | required, plain text, 1..5000, with a character counter |

Note shown: "The category can't be changed once the product has variants." [SPEC 06].
Action: `POST /seller/products` → `201 SellerProductDetailDto` (status `draft`) → `/products/{id}` with "Draft created. Add a variant to publish it."
Errors: `SELLER_NOT_APPROVED` (§2.2), `CATEGORY_NOT_FOUND` (422) → refetch the tree, "This category is no longer available."

### SE-10 Product

Route: `/products/[productId]` · Data: `GET /seller/products/{productId}` (`PRODUCT_NOT_FOUND` → not found), `GET /categories`, `GET /categories/{categoryId}/attributes` (for the variant form; `CATEGORY_NOT_FOUND` → variants can't be added, SE-Q-2).
Content:
1. Header: name, status badge, visible/hidden, "View in store" link to the storefront `/p/{slug}` (only when `visible`; URL from config).
2. Status actions (A2/A3) and Delete (A4).
3. Details form (A1).
4. Variants table (SE-11): per variant SKU, options ("Size: M · Color: Red", or "Default" when `isDefault`), price, compare-at price, status, stock **On hand / Reserved / Sellable** (`stock`), actions Edit, Adjust stock (SE-12), History (SE-13), Delete.
5. "Add variant" (SE-11) — approved only; for a category without attributes, hidden once one variant exists [SPEC 06 `DEFAULT_VARIANT_EXISTS`].
Stock column help [SPEC 06 UC-CA-5, SPEC 07]: "On hand: units you hold, including units in orders not yet delivered. Reserved: held for customers' open orders. Sellable: what customers can still buy (on hand − reserved)."

Actions:
- **A1 Save details** — `PATCH /seller/products/{id}` with changed fields among name (2..200), description (1..5000), category (only while the product has **no** variants; otherwise the picker is disabled with the reason) [SPEC 06]. Errors: `PRODUCT_CATEGORY_LOCKED` (refetch), `CATEGORY_NOT_FOUND`, `SELLER_NOT_APPROVED`.
- **A2 Publish** — status `draft` or `inactive`: `POST /seller/products/{id}/activate`. Disabled with "Add at least one active variant first." when no variant has status `active` [SPEC 06]. Errors: `PRODUCT_HAS_NO_ACTIVE_VARIANT`, `PRODUCT_INVALID_STATUS_TRANSITION` (refetch).
- **A3 Unpublish** — status `active`: confirm "Hide this product from the store? Existing orders aren't affected." → `POST …/deactivate`.
- **A4 Delete** — confirm "Delete {name} and all its variants? This can't be undone. Past orders keep their details." → `DELETE /seller/products/{id}` → `204` → `/products` with toast.
- Every action returns the new `SellerProductDetailDto` (or 204) → replace the cache.
Acceptance:
1. Category change is impossible once variants exist.
2. Publish is unavailable without an active variant.
3. Status and visibility shown always match the last API response.

### SE-11 Variant form (dialog; create and edit)

Data: the category's effective attributes `GET /categories/{categoryId}/attributes` (own + inherited, each with options) and the product's existing variants.

**Create** [VERIFIED `CreateVariantDto`]:

| Field | Rules |
|---|---|
| One select per attribute (order as returned; options in returned order) | required: exactly one option per attribute [SPEC 06 UC-CA-4]. Combinations that already exist on this product are disabled ("Already exists") |
| SKU | required, 1..64, letters, digits, `.`, `_`, `-`; unique among **your** SKUs, case-insensitive (`SKU_TAKEN`) |
| Price (EGP) | required, money, greater than 0 |
| Compare-at price (EGP) | optional, money, must be greater than price (`COMPARE_AT_PRICE_INVALID`); help: "Shown struck through as the old price." |
| Initial stock | required, integer 0..100000 |
| Status | Active (default) / Inactive [PROPOSED default] |

- Category without attributes: no selects, `optionIds: []`; only one variant is possible (it becomes the default variant).
- Body sends `optionIds` in attribute order.
Action: `POST /seller/products/{productId}/variants` → `201 SellerVariantDto` → refetch the product (prices, `inStock` and status may change).
Errors: `VARIANT_OPTIONS_INVALID` (422; refetch attributes, show "The options for this category changed. Please choose again."), `DEFAULT_VARIANT_EXISTS`, `VARIANT_COMBINATION_EXISTS`, `SKU_TAKEN`, `VARIANT_LIMIT_REACHED` ("A product can have at most 100 variants."), `COMPARE_AT_PRICE_INVALID`, `SELLER_NOT_APPROVED`, `PRODUCT_NOT_FOUND`.

**Edit** [VERIFIED `UpdateVariantDto`]: SKU, price, compare-at price (clearing it sends `null`), status. Options are read-only with the note "Options can't be changed. Delete this variant and create a new one instead." [SPEC 06]. Stock isn't edited here (SE-12). `PATCH …/variants/{variantId}` with changed fields → refetch the product.
- Setting the **last active** variant of an active product to inactive: confirm "This is the last active variant, so the product will be hidden from the store." (the backend deactivates the product [SPEC 06 UC-CA-3]).

**Delete**: confirm "Delete variant {sku}?" (+ the last-active warning when it applies) → `DELETE …/variants/{variantId}` → `204` → refetch the product.
Acceptance:
1. A create request always contains exactly one option per effective attribute.
2. Existing combinations can't be submitted.
3. The last-active-variant consequence is announced before it happens.

### SE-12 Stock adjustment (dialog)

Opened from a variant row. Data: refetch `GET /seller/products/{productId}` when the dialog opens (fresh stock).
Content: current On hand / Reserved / Sellable; two modes [PROPOSED, SE-Q-3]:
- **Add or remove** (default): radio "Add" / "Remove", quantity integer 1..100000 → `delta = ±quantity`.
- **Set on-hand count to…**: integer 0..100000; `delta = target − onHand` (onHand from the fresh read). Help: "Use this after counting your shelf. Remember on hand includes units in orders that haven't been delivered yet." If `delta = 0` → "No change needed." and submit disabled.

Before submitting, the dialog always states the effect: "This will add 5 units (on hand 12 → 17)." / "This will remove 3 units (on hand 12 → 9)."
Validation: delta ≠ 0, −100000..100000; removing more than `onHand − reserved` is blocked client-side with "You can remove at most {sellable} units: {reserved} are reserved for open orders." (the backend rule is `on_hand + delta ≥ reserved` and `≥ 0` [SPEC 06 UC-CA-5]).
Action: `POST /seller/variants/{variantId}/stock-adjustments { delta }` with `Idempotency-Key` (one key per confirmed adjustment; reused on retry) → `200 VariantStockDto` → update the row; refetch the product (`inStock` may change shortly after via the backend projection [SPEC 06 CA-9]).
Errors: `STOCK_ADJUSTMENT_INVALID` → refetch and "Stock changed meanwhile. Please check the numbers and try again."; `VARIANT_NOT_FOUND`; `SELLER_NOT_APPROVED`.
Acceptance:
1. The confirmed effect text equals the delta sent.
2. A retried request after a network error never applies the adjustment twice (same key).
3. "Set to" always computes the delta from stock read when the dialog opened, and the effect text makes the delta explicit.

### SE-13 Stock history

Route: `/products/[productId]/variants/[variantId]/stock` · Data: `GET /seller/variants/{variantId}/stock-movements` (newest first, `limit=20`, load more).
Row: date, type label, change in sellable stock (`quantityDelta`, signed), on hand after, reserved after, and for order-related movements "Order item" (no link: the reference is an order line, not a seller order) [VERIFIED `referenceType`].
Type labels [SPEC 07 IN-6]:

| `type` | Label | Note |
|---|---|---|
| `seller_adjustment` | Stock adjusted by you | |
| `reserve` | Reserved for an order | sellable −q |
| `release` | Released (order cancelled or returned) | sellable +q |
| `commit` | Delivered to the customer | sellable unchanged; on hand drops |

Header note: "Change shows the effect on sellable stock." 

### SE-14 Orders

Route: `/orders?tab=` · Data: `GET /seller/orders` (`limit=20`) · Refetch every 60 s while visible.
Tabs [PROPOSED]:

| Tab | `status[in]` | Sort |
|---|---|---|
| To confirm | `placed` | `createdAt` (oldest first: nearest deadline first) |
| To prepare | `accepted` | `createdAt` |
| Awaiting pickup | `ready_for_pickup` | `createdAt` |
| In delivery | `picked_up,out_for_delivery,delivery_failed` | `-createdAt` |
| Returns | `returning_to_seller,returned_to_seller` | `-createdAt` |
| Delivered | `delivered` | `-createdAt` |
| Cancelled | `cancelled` | `-createdAt` |
| All | – | `-createdAt` |

Row: order number, date, status badge, payment method ("Cash on delivery" / "Paid by card"), item count (Σ open quantities), subtotal, your net (`sellerNet`), drop-off governorate; in "To confirm": countdown to `acceptDeadlineAt`.
Optional date filter (`createdAt[gte|lte]`) [PROPOSED].
States: per tab empty text, e.g. "No orders to confirm."

### SE-15 Order

Route: `/orders/[sellerOrderId]` · Data: `GET /seller/orders/{sellerOrderId}` (`SELLER_ORDER_NOT_FOUND` → not found). Refetch on focus and every 60 s while visible and the order is not terminal.
Content:
1. Header: "Order {orderNumber}", status badge, created date, payment method.
2. Deadline (status `placed`): "Confirm by {acceptDeadlineAt} ({countdown}). Unconfirmed orders are cancelled automatically after 24 hours." [SPEC 00 Q-7]
3. Items: product name (link to SE-10 by `productId`; may be "not found" if deleted), attributes, SKU, unit price, quantity, cancelled quantity ("{n} cancelled"), open quantity, line total.
4. Money: subtotal, commission ({rate %}) = `commission`, "You receive" = `sellerNet`, with the note "Amounts are fixed at the time of the order." [SPEC 00 §3 snapshots].
5. Delivery: "Drop-off in {dropoffGovernorate.name}". "Customer details are handled by the delivery agent." [SPEC 09 S-11]
6. Timeline from the timestamps: created, accepted, ready, picked up, delivered, returned, cancelled (only those not null).
7. Cancellation reason when cancelled (§5.2).

Actions by status [SPEC 09 §1.1, §4.2]:

| Status | Actions |
|---|---|
| `placed` | A1 Confirm order · A3 Cancel order · A4 Cancel items |
| `accepted` | A2 Mark ready for pickup · A3 · A4 |
| `ready_for_pickup` | A3 · A4 (a courier may already be assigned) |
| `returning_to_seller` | A5 Confirm return received |
| others | none |

- **A1 Confirm order**: `POST /seller/orders/{id}/accept` → `200 SellerOrderDto`. After the deadline the button stays until the backend cancels it (accept is still possible until the timeout job runs [SPEC 09 UC-OR-3]); a `SELLER_ORDER_INVALID_STATUS_TRANSITION` then shows "This order was cancelled because it wasn't confirmed in time."
- **A2 Mark ready for pickup**: confirm "Is the parcel packed and ready? A delivery agent will be assigned to collect it." → `POST …/ready`.
- **A3 Cancel order**: dialog with optional note (1..500) "Cancel the whole order? The customer will be informed and the stock released." → `POST …/cancel { note? }` with `Idempotency-Key`. Errors: `SELLER_ORDER_NOT_CANCELLABLE` → refetch + "This order has been picked up and can't be cancelled any more."
- **A4 Cancel items**: per item with open quantity > 0: dialog with quantity (1..open quantity), reason (`out_of_stock` "Out of stock", `seller_request` "Seller request", `other` "Other"), note (required when reason is Other, 1..500) → `POST …/items/{itemId}/cancel { quantity, reason, note? }` with `Idempotency-Key`. When the cancellation covers **every** open unit of the order, the dialog warns "This cancels the whole order." [SPEC 09 UC-OR-5]. Errors: `ITEM_CANCEL_QUANTITY_INVALID` (refetch), `ORDER_ITEM_NOT_FOUND`, `SELLER_ORDER_NOT_CANCELLABLE`.
- **A5 Confirm return received**: confirm "Confirm the returned parcel arrived? The items go back into your sellable stock." → `POST …/return-received` with `Idempotency-Key`.
- Every action response replaces the cached order; lists are invalidated.
Acceptance:
1. Only the actions valid for the current status are offered.
2. Idempotent actions reuse their key on retry; a replayed success looks like a first success.
3. Customer details never appear (none are returned).

### SE-16 Finance

Route: `/finance?tab=statement|payouts` · Data: `GET /seller/finance/balance`; statement `GET /seller/finance/entries` (`limit=20`, `-createdAt`, optional `createdAt[gte|lte]`); payouts `GET /seller/finance/payouts`.
Content:
1. Balance: "Nile owes you {balance}" + "Last updated {updatedAt}" (or "No earnings yet."). Explanation: "You earn the order amount minus Nile's commission when an order is delivered. Nile pays you outside the app and records each payout here." [SPEC 00 §5, SPEC 12].
2. Tab **Statement**: date, description, amount (+ for credit, − for debit), balance after. Description by `entryType`: `seller_net_earned` → "Earnings from order" with a link to SE-15 (`referenceId` = seller order id when `referenceType = seller_order` [SPEC 12]); `seller_payout` → "Payout" (link to the Payouts tab). Other entry types never appear on a seller account [SPEC 12 §1.2]; if one does, it is shown with its raw type and logged.
3. Tab **Payouts**: paid date (`paidAt`), amount, reference (`externalReference`), recorded date.
States: empty statement → "No transactions yet."; empty payouts → "No payouts yet."

### SE-17 Security
As storefront SF-19 (change password, sign out), within the seller app.

---

## 5. Copy

### 5.1 Seller order status (seller view) [PROPOSED wording]

| Value | Label |
|---|---|
| `placed` | New — confirm |
| `accepted` | Confirmed — prepare |
| `ready_for_pickup` | Ready for pickup |
| `picked_up` | Picked up |
| `out_for_delivery` | Out for delivery |
| `delivery_failed` | Delivery attempt failed |
| `returning_to_seller` | Being returned to you |
| `returned_to_seller` | Returned |
| `delivered` | Delivered |
| `cancelled` | Cancelled |
| `pending_payment` | (never shown) |

### 5.2 Cancellation reason (`cancelReason`) [VERIFIED enum]

| Value | Label |
|---|---|
| `customer_cancelled` | Cancelled by the customer |
| `seller_cancelled` | Cancelled by you |
| `seller_acceptance_timeout` | Not confirmed within 24 hours |
| `payment_failed` | The customer's card payment failed |
| `payment_expired` | The customer didn't complete the card payment |

(The last two can appear: an unpaid card order that expires is cancelled and is then listed for the seller [VERIFIED: only `pending_payment` is hidden].)

### 5.3 Product and variant status

| Value | Label |
|---|---|
| product `draft` | Draft |
| product `active` | Published |
| product `inactive` | Unpublished |
| variant `active` | Active |
| variant `inactive` | Inactive |

### 5.4 Seller status

| Value | Label |
|---|---|
| `pending_approval` | Waiting for approval |
| `approved` | Approved |
| `rejected` | Rejected |
| `suspended` | Suspended |

## 6. Non-functional

- Polling: overview and orders 60 s, order detail 60 s while not terminal; only while the tab is visible.
- All portal pages `noindex`, `no-store`.
- Breakpoints: usable on a phone (sellers may confirm orders on mobile); the variants table becomes stacked cards below 768 px.

## 7. Questions (all answered 2026-10-14: the recommendation was accepted for each)

| # | Question | Options (recommendation first = decision) |
|---|---|---|
| SE-Q-1 | Overview content | **Status, orders to confirm (5), returns to confirm (5), balance, shortcuts (Rec)** · orders list only |
| SE-Q-2 | Products in a category that was later deactivated: the seller can't read inactive categories (public endpoints only), so the name and attributes are unavailable | **Show "Unavailable category"; editing details still works; adding variants is blocked with "This category is no longer available. Contact support." (Rec)** · ask the backend to expose category names on seller product DTOs |
| SE-Q-3 | "Set on-hand count to…" helper in the stock dialog | **Include, with the effect always stated as a delta (Rec)** · deltas only |
| SE-Q-4 | Creating many variants at once (e.g. every size × colour) | **One variant at a time in R1, with "Save and add another" (Rec)** · a matrix generator that sends one request per combination |
| SE-Q-5 | Order tabs and sort (To confirm oldest first) | **As in SE-14 (Rec)** · a single list with a status filter |
| SE-Q-6 | Packing slip / print view | **Not in R1 (Rec)**: no customer data to print; the agent has the address · a print view with order number and items |
| SE-Q-7 | Default status of a new variant | **Active (Rec)** · Inactive |
| SE-Q-8 | Showing the seller's net per order in lists | **Yes, `sellerNet` column (Rec)** · subtotal only |
