# Spec 02 — Seller portal

Status: **v1.0 APPROVED (2026-10-14); v1.1 APPROVED (2026-10-23): §8 Release 2, every recommendation and [PROPOSED] item accepted (T-J0).** Approved by the user with every recommendation in §7 (SE-Q-1…SE-Q-8) and every [PROPOSED] item. Changes from now on need explicit approval and a version bump.
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

---

## 8. Release 2 [v1.1 APPROVED 2026-10-23, T-J0]

Backend inputs at `ecbcd19`: specs 05 §8, 06 §8, 09 §8, 12 §8, 13 §8, 14, 15, 16, 17, 18, 19, 20 §3.4. Conventions: `00-conventions.md` §12. Plan: `release-2-plan.md` (phase l). Workflows: `workflows.md` §6.3.

### 8.1 Scope changes
- **Now in scope:** product images; blocked products; returns from customers; reviews and replies; seller-funded coupons; support tickets; holding period (pending / available balance, holds); notification centre and Web Push; live updates.
- **§1 rows removed:** "Product images" (now R2), "Push / sound notifications" (now Web Push and live updates; still no sound).
- **Still out of scope:** customer contact data (also in returns [SPEC 18 S-11]); editing or deleting a review reply (RV-5); bulk image upload across products; sales analytics.

### 8.2 Navigation and route map additions
Sidebar: Overview · Orders · **Returns** · Products · **Reviews** · **Coupons** · Finance · **Support** · Profile · Security · Sign out. Header: + bell (conventions §12.4).

| Route | Screen | Access |
|---|---|---|
| `/returns` | SE-18 Returns | seller |
| `/returns/[returnId]` | SE-19 Return | seller |
| `/reviews` | SE-20 Reviews | seller |
| `/coupons` | SE-21 Coupons | seller |
| `/coupons/new` | SE-22 New coupon | seller (approved) |
| `/coupons/[couponId]` | SE-23 Coupon | seller |
| `/support` | SE-24 Support tickets | seller |
| `/support/new` | SE-25 New ticket | seller |
| `/support/[ticketId]` | SE-26 Ticket thread | seller |
| `/notifications` | SE-27 Notifications | seller |
| `/notifications/settings` | SE-28 Notification settings | seller |

§2.2 status table additions: image writes, coupon create / edit and review replies are catalog-style writes (**approved only**, `SELLER_NOT_APPROVED`) [SPEC 06 §8.2, 17 UC-RV-3, 19 UC-PR-4]; returns decisions are allowed for `approved` and `suspended` sellers (open orders continue [SPEC 18 UC-RE-2]); reading reviews, coupons, tickets and finance is allowed in every status; support tickets can be opened in every status (`seller_onboarding` is meant for pending and rejected sellers).

### 8.3 Changes to existing screens

**SE-06 Overview** (SE-Q-11): + "Returns to decide" — up to 5 `requested` returns by decision deadline (`GET /seller/returns?status[eq]=requested&sort=sellerDecisionDeadlineAt&limit=5`) with the countdown, and up to 5 `received` returns ("Check the returned items by {deadline}"); the balance card shows Available and Pending (SE-16). Live: refetch on `seller_order.placed`, `seller_order.updated`, `return.updated`; the 60 s polling stays only without a socket.

**SE-08 Products:** + thumbnail (`primaryImage`, placeholder when `null`); badge "Blocked by Nile" when `adminBlocked` (text, warning tone).

**SE-10 Product:**
1. **Blocked** (`adminBlocked = true`): banner "Nile blocked this product: {adminBlockReason}. It's hidden from the store and its status can't be changed. Contact support if you think this is a mistake." + "Contact support" (SE-25, category Account [PROPOSED]). Publish / Unpublish are disabled with that reason; `PRODUCT_BLOCKED` from any write → refetch + the banner text as a toast. After an unblock the product stays inactive; the seller publishes it again [SPEC 20 §3.4].
2. **Images section** (SE-10-I), above the details form:
   - Grid of up to 8 images in order; the first is labelled "Main image"; each tile shows its variant tie ("Shown for: Red / M") and alt text status ("No description").
   - "Add images" (approved only, disabled at 8 with "A product can have up to 8 images."): conventions §12.2 with purpose `product_image`; each `ready` upload is attached at once with `POST /seller/products/{id}/images { mediaId }` (appended) → the response replaces the image list.
   - Per tile menu: "Move earlier" / "Move later" / "Make main image" → `PUT …/images/order { imageIds }` with the full new order (SE-Q-9); "Edit" (dialog: alt text 1..200 optional, "Show for variant" select of the product's variants or "All variants") → `PATCH …/images/{imageId}` with changed fields (cleared → `null`); "Remove" (confirm "Remove this image?") → `DELETE …/images/{imageId}` → refetch the product.
   - Errors: `PRODUCT_IMAGE_LIMIT_REACHED` → refetch + "A product can have up to 8 images."; `PRODUCT_IMAGE_ORDER_INVALID` → refetch + "The images changed. We've refreshed them, please try again."; `PRODUCT_IMAGE_NOT_FOUND` → refetch; `VARIANT_NOT_FOUND` → refetch variants; `MEDIA_NOT_ATTACHABLE` → the tile asks to upload again.
   - Note: "Images help customers decide. Products can be published without images." [SPEC 06 R-3]
3. Variants table: + "Image" column (thumb of the variant's image, or "Main image").

**SE-14 Orders / SE-15 Order:**
- Rows and money: when `discountAmount > 0`: "Coupon discount −{discountAmount}" with "Funded by you" / "Funded by Nile" (`discountFunding`), and the net explained: seller-funded → "Commission is calculated after your coupon discount."; Nile-funded → "Nile covers this discount; your earnings aren't reduced." [SPEC 19 R-17, PR-7].
- Returned sums (`returnedSubtotal`, `returnedCommission`, `returnedSellerNet`) shown under the money block when not zero: "Returned by the customer: −{returnedSellerNet} from your earnings"; items show "{returnedQuantity} returned".
- Cancellation reason `admin_cancelled` → "Cancelled by Nile."
- SE-15 + "Get help with this order" → SE-25 with the seller order preselected; no link to the order's return (the returns list has no seller-order filter [VERIFIED backend routes]; returns show their order, SE-19).
- Live: refetch on `seller_order.placed` (list), `seller_order.updated` (list and detail); polling only without a socket.

**SE-16 Finance:**
1. Balance card: **Available** `{available}` — "Nile can pay you this amount." · **Pending** `{pending}` — "Earnings from delivered orders that are still within the 14-day return period." When `available` is negative: "You owe Nile {abs(available)} because of return fees. It's taken from your next earnings." (no payout is possible while negative [SPEC 12 FI-12]).
2. New tab **On hold** (`GET /seller/finance/holds`, load more): order number (link to SE-15), amount, "Released on {releaseAfter}", and "Waiting for an open return" when `blockedByReturn`. Empty: "Nothing on hold."
3. Statement descriptions for the new entry types (§8.6).

### SE-18 Returns

Route: `/returns?tab=to-decide|to-check|in-progress|closed` · Data: `GET /seller/returns` (`limit=20`).

| Tab | `status[in]` | Sort |
|---|---|---|
| To decide | `requested` | `sellerDecisionDeadlineAt` (nearest first) |
| To check | `received` | `createdAt` (oldest first) [PROPOSED: no inspection-deadline sort exists] |
| In progress | `rejected,escalated,approved,picked_up,disputed` | `-createdAt` |
| Closed | `completed,refused,cancelled,pickup_failed` | `-createdAt` |

Row: return number, order number, reason, items count, refund amount, status badge, deadline countdown in "To decide" / "To check". Live on `return.updated`.

### SE-19 Return

Route: `/returns/[returnId]` · Data: `GET /seller/returns/{id}` (`RETURN_NOT_FOUND` → not found); live on `return.updated`.
Content: number, status, order link (SE-15), reason (with "Seller fault" note for damaged / wrong item / not as described: "You pay the return delivery fee of {returnFee}."), customer's description, photos (private), items (image, name, options, quantity, paid amount), refund amount, deadlines, timeline. No customer name, phone or address [SPEC 18 S-11].
Actions:
- **Approve** (`requested`): confirm "Approve this return? An agent will collect the items from the customer and bring them to your pickup address." → `POST …/approve`.
- **Reject** (`requested`): dialog, reason 3..500 required, note "The customer can ask Nile to review your decision." → `POST …/reject`.
- **Confirm receipt** (`received`, before `inspectionDeadlineAt`): dialog listing every item with "Put back in stock" (checkbox per item, default on [PROPOSED]) → `POST …/confirm-receipt { items[{ returnItemId, restock }] }` with Idempotency-Key → `200`. Note "The customer is refunded once you confirm. If you don't respond by {deadline}, the return is confirmed without restocking." [SPEC 18 RE-6]
- **Report a problem** (`received`, before the deadline): dialog, reason 3..500, photos 0..4 (`return_photo`) → `POST …/dispute`. Note "Nile will review and decide whether the customer is refunded."
- Errors: `RETURN_INVALID_STATUS_TRANSITION` → refetch + "This return was already updated (for example approved automatically when the deadline passed)."; `RETURN_ITEMS_MISMATCH` → refetch + reopen the dialog; `RETURN_INSPECTION_WINDOW_CLOSED` → refetch + "The time to report a problem has passed."
Acceptance: actions appear only for their statuses and before their deadlines; restock choices are sent for every item exactly once.

### SE-20 Reviews

Route: `/reviews?product=&rating=&replied=` · Data: `GET /seller/reviews` (`limit=20`, `-createdAt`).
Filters (URL): product (select of the seller's products, `productId[eq]`), rating chips (`rating[in]`), "Not replied" (`replied[eq]=false`), date range (`createdAt[gte]`, Cairo days).
Row: product (link SE-10), stars, title, body, reviewer display name, variant options, date, photos, the reply when present.
**Reply** (`canReply`, approved sellers): inline form 1..1000 with the note "You can reply once and can't edit it later." → `POST /seller/reviews/{id}/reply` → replace the row. Errors: `REVIEW_ALREADY_REPLIED` / `REVIEW_HIDDEN` → refetch + "This review can't be replied to any more."; `REVIEW_NOT_FOUND` → refetch.
Empty: "No reviews yet."

### SE-21 Coupons

Route: `/coupons?status=` · Data: `GET /seller/coupons` (`limit=20`, `-createdAt`, `status[eq]`).
Row: code, discount ("10 %, up to EGP 50" / "EGP 25 off"), scope ("All your products" / category path), dates, uses (`redemptionCount` of `globalLimit` or "unlimited"), display status badge (`displayStatus`), "Blocked by Nile" when `adminBlocked` [VERIFIED backend `CouponDto.adminBlocked`, `adminBlockReason`]. "New coupon" (approved only).

### SE-22 New coupon / SE-23 Coupon

Routes: `/coupons/new`, `/coupons/[couponId]` (detail + edit form).
Fields [SPEC 19 §1.1, §4]:

| Field | Rule |
|---|---|
| Code | create only; trimmed, upper-cased, `^[A-Z0-9-]{4,32}$` |
| Discount type | Percent · Fixed amount |
| Discount | percent: 1–90 with up to 2 decimals, sent as a rate string (`fields.percentRate`, SE-Q-10); fixed: money > 0 |
| Maximum discount | percent only, optional money |
| Minimum order (eligible items) | money ≥ 0 (default "0.00") |
| Applies to | All my products (`seller`) · One category (`category` + category picker with full-path labels, any level, SE-Q-13) |
| Starts / Ends | Cairo `datetime-local`, sent as UTC ISO; ends after starts |
| Total uses | optional int 1..1 000 000 (empty = unlimited) |
| Uses per customer | required int 1..100, default 1 [SPEC 19 PR-3] |
| Active | switch (status) |

- Create → `POST /seller/coupons` → `201` → SE-23. Edit → `PATCH` with changed fields only.
- After the first use (`redemptionCount > 0`): only Ends, Total uses (not below `redemptionCount`) and Active are editable; the others are read-only with "Locked after the first use." [SPEC 19 PR-8].
- A blocked coupon (`adminBlocked`): banner "Nile blocked this coupon: {adminBlockReason}" and Active can't be turned on (`COUPON_BLOCKED`).
- Help text: "Customers enter the code at checkout. The discount applies to your products only and is paid by you; Nile's commission is calculated after the discount." [SPEC 19 R-17]
- Errors: `COUPON_CODE_TAKEN` → code field "This code is already used. Choose another."; `COUPON_INVALID` → map `details` to fields, else form alert; `COUPON_LOCKED` → refetch + "This coupon has been used, so only the end date, total uses and status can change."; `COUPON_BLOCKED` → refetch + banner; `CATEGORY_NOT_FOUND` → category field.

### SE-24 / SE-25 / SE-26 Support
As storefront SF-29 / SF-30 / SF-31 within the seller app, with:
- Categories: Order · Payment · Delivery · Return · Account · Seller account (`seller_onboarding`) · Other.
- Link: one seller order (select of recent seller orders, or prefilled from SE-15 / SE-19) → `sellerOrderId` only (`orderId` is refused for sellers [SPEC 16 §4.1]).
- Admins appear as "Nile Support".

### SE-27 / SE-28 Notifications
As conventions §12.4–§12.6 with the seller link map (§12.5).

### 8.4 Acceptance across Release 2 (seller)
1. Image, coupon and reply writes are disabled with the banner's sentence for sellers who aren't approved; return decisions stay available to suspended sellers.
2. No customer contact data appears anywhere, returns included.
3. Every amount shown comes from the API (balances, holds, discounts, returned sums).

### 8.5 Non-functional additions
Live updates replace the 60 s polling of SE-06, SE-14 and SE-15 when a socket is connected; polling stays as the fallback.

### 8.6 Copy

**Return status, seller view:** `requested` To decide · `rejected` Rejected by you · `escalated` Under review by Nile · `approved` Approved, awaiting pickup · `picked_up` On its way to you · `received` To check · `disputed` Under review by Nile · `completed` Completed · `refused` Closed, not refunded · `cancelled` Cancelled by the customer · `pickup_failed` Pickup failed.
**Return reason:** Damaged · Wrong item · Not as described · Changed their mind.
**Coupon display status:** `scheduled` Scheduled · `active` Active · `expired` Expired · `inactive` Inactive.
**Statement descriptions (new entry types)** [SPEC 12 §8]: `seller_net_held` Earnings on hold (return period) · `seller_net_released` Earnings released · `seller_net_reversed` Returned items · `return_fee_charged` Return delivery fee · `seller_net_earned` (R1) Earnings from order. Any other type stays as in §5 (raw + `console.warn`).
**Cancellation reason (§5.2):** + `admin_cancelled` Cancelled by Nile.
**Notification category:** Orders · Deliveries · Support · Offers.

### 8.7 Questions (Release 2)

| # | Question | Options (recommendation first) |
|---|---|---|
| SE-Q-9 | Reordering images | **"Move earlier / Move later / Make main image" in each tile's menu (Rec: keyboard-complete, no new dependency)** · drag and drop (needs a library or custom pointer handling plus a keyboard fallback) |
| SE-Q-10 | Percent coupons | **Typed as a percent with up to 2 decimals and sent as a rate with decimal arithmetic, as admin rates (R-44) (Rec)** · typed as a rate |
| SE-Q-11 | Overview additions | **Returns to decide (5) and returns to check (5), Available + Pending balance (Rec)** · a returns link only |
| SE-Q-12 | Default of "Put back in stock" when confirming receipt | **On for every item; the seller unticks damaged ones (Rec)** · off by default |
| SE-Q-13 | Category scope picker for coupons | **The existing Select with full-path labels (R-39) (Rec)** · searchable Combobox (still deferred) |
| SE-Q-14 | Blocked product: where "Contact support" leads | **SE-25 with category Account and the product named in the subject (Rec)** · no link |
