# Spec 01 — Storefront (visitor + customer)

Status: **v1.0 APPROVED (2026-10-14).** Approved by the user with every recommendation in §9 (SF-Q-1…SF-Q-12) and every [PROPOSED] item; SF-Q-12 adds "Buy again" (SF-18-A3). Changes from now on need explicit approval and a version bump.
Conventions: `00-conventions.md` (notation, states, default error handling, forms, lists, formatting). Backend specs cited as [SPEC 03] … [SPEC 12] = `../nile-marketplace2/docs/spec/<nn>-*.md`.
App: `apps/storefront`, dev port 4100. Access roles: public, `customer`.

---

## 1. Scope

**In scope:** browse and search the catalog; product pages; customer registration, email verification, sign-in, password reset; cart; checkout with cash on delivery (COD) and Kashier; payment return; order history, order detail, customer cancellation, pay-now for unpaid Kashier orders; profile, addresses, password change; the neutral invite landing for admins and delivery agents (`architecture.md` §5.7).

**Out of scope (and why):**

| Item | Reason |
|---|---|
| Product images, reviews, ratings, wishlist, coupons, returns | Not in the R1 API (R2) [SPEC 00 §1] |
| Guest cart / guest checkout | No guest cart in the API; login required at "Add to cart" (FQ-6) |
| Search suggestions / autocomplete | No endpoint |
| Result counts, page numbers | Cursor pagination without totals |
| Live order tracking, shipment/agent details | Customer order DTO has no shipment data [VERIFIED] |
| Who/why a seller order was cancelled | Customer DTO has no cancel reason [VERIFIED `CustomerSellerOrderDto`] |
| Email change, account deletion, log out of all devices | No endpoints |
| Seller, admin, agent screens | Their own apps |
| CMS content (banners, promotions, static pages) | No content source (SF-Q-1, SF-Q-8) |

## 2. Global elements

### 2.1 Layout

Header (every page) · main content · footer. Responsive per `00-conventions.md` §10.

### 2.2 Header

| Element | Behaviour |
|---|---|
| Logo "Nile" | Link to `/` |
| Categories menu | From `GET /categories` (active tree, ≤ 3 levels, ordered as returned). Desktop: menu with top-level categories and their children; mobile: a drawer with expandable levels. Each item links to `/c/[slug]` |
| Search box | Submits to `/search?q=<text>`. Text trimmed; 2–100 characters [VERIFIED `q` 2..100]: below 2 the submit is disabled with the hint "Type at least 2 characters"; the input stops at 100 |
| Account area (signed out) | "Sign in" → `/login?returnTo=<current>`, "Create account" → `/register?returnTo=<current>` |
| Account area (signed in) | "Hi, {firstName}" from `GET /me`; menu: Orders (`/account/orders`), Addresses (`/account/addresses`), Account (`/account`), Security (`/account/security`), Sign out |
| Cart button | Signed in: link to `/cart` with a badge = `CartDto.itemCount` (hidden when 0). Signed out: link to `/login?returnTo=/cart` without a badge |

- Catalog pages are server-rendered **without** user data so they stay cacheable; the account area and cart badge are client islands that load after hydration (`GET /me`, `GET /cart` through the BFF) [PROPOSED].
- `itemCount` counts only lines without issues [SPEC 08 CT-6], so the badge can be lower than the number of lines on the cart page. This is expected behaviour.

### 2.3 Footer [PROPOSED]

"© {year} Nile" and links to `/` and `/account/orders`. No legal pages until content exists (SF-Q-8).

### 2.4 Route map

| Route | Screen | Access | Render |
|---|---|---|---|
| `/` | SF-01 Home | public | server |
| `/c/[slug]` | SF-02 Category | public | server + client listing |
| `/search` | SF-03 Search | public | server + client listing |
| `/p/[idOrSlug]` | SF-05 Product | public | server |
| `/cart` | SF-06 Cart | customer | shell + client |
| `/checkout` | SF-07 Checkout | customer | shell + client |
| `/checkout/confirmation/[orderId]` | SF-08 Confirmation | customer | shell + client |
| `/checkout/payment-return` | SF-09 Payment return | customer | client |
| `/login` | SF-10 Sign in | public (signed in → redirect to `returnTo` or `/`) | server + client form |
| `/register` | SF-11 Create account | public (same redirect) | server + client form |
| `/verify-email` | SF-12 Verify email | public | client |
| `/forgot-password` | SF-13 Forgot password | public | client |
| `/reset-password` | SF-14 Reset password | public | client |
| `/account` | SF-15 Profile | customer | shell + client |
| `/account/addresses` | SF-16 Addresses | customer | shell + client |
| `/account/orders` | SF-17 Orders | customer | shell + client |
| `/account/orders/[orderId]` | SF-18 Order detail | customer | shell + client |
| `/account/security` | SF-19 Security | customer | shell + client |
| `/invite` | SF-20 Invite landing | public | client |
| any unknown | SF-21 Not found | public | server |

---

## 3. Catalog screens

### SF-01 Home

Route: `/` · Access: public · Render: server (category tree revalidated every 5 min; product list not cached)
Data: `GET /categories`; `GET /products?limit=12` (default sort `-publishedAt` = newest) [PROPOSED content, SF-Q-1].
Content:
1. Search box (large).
2. "Shop by category": one tile per **top-level** category (name), linking to `/c/[slug]`.
3. "New arrivals": up to 12 product cards (SF-04 card) and a link "See all" → `/search?sort=newest` (SF-03 without `q`).
States: no categories → hide section 2; no products → section 3 says "New products are coming soon."; API failure in one section shows that section's error block, the rest renders.
Acceptance:
1. Only active categories appear (the API returns only active ones).
2. "New arrivals" shows the newest published products first.
3. The page renders without JavaScript for content (server-rendered).

### SF-02 Category page

Route: `/c/[slug]` · Access: public · Render: server (first page) + client (more pages, filter changes)
Data: `GET /categories` → find the node whose `slug` = `[slug]` (unknown → SF-21); `GET /categories/{id}/attributes` (facets); `GET /products` with `categoryId[eq]={id}` + parameters from the URL (SF-04).
Content:
1. Breadcrumbs: Home › ancestors › current (ancestors from the tree).
2. Title = category name.
3. Subcategory chips (direct children), each linking to its page.
4. Product listing with filters and sort (SF-04). Products of all descendant categories are included [SPEC 06 UC-CA-6].
States: per SF-04.
Acceptance:
1. Unknown or inactive slug → not-found page (HTTP 404).
2. Attribute facets show the category's own and inherited attributes [SPEC 06].
3. Changing filters updates the URL; reloading the URL reproduces the same results.

### SF-03 Search results

Route: `/search?q=…` · Access: public · Render: server (first page) + client
Data: `GET /products` with `q` and SF-04 parameters. Facets only when a category is chosen: `GET /categories/{id}/attributes`.
Content:
1. Title: `Results for "{q}"` (or "All products" without `q`).
2. "Category" refinement: a select of the category tree; choosing one adds `category=<slug>` to the URL, sends `categoryId[eq]` and enables attribute facets (attribute filters require a category [VERIFIED `INVALID_QUERY requires_category`]).
3. Product listing (SF-04).
- Default sort: "Best match" (`-relevance`) with `q`, "Newest" without `q` [SPEC 06]. "Best match" is not offered without `q` [VERIFIED: `sort=relevance` without `q` → `INVALID_QUERY`].
- `q` shorter than 2 characters in the URL → treated as no `q`.
- Seller products: `/search?seller=<sellerId>` sends `sellerId[eq]`; title "Products from {businessName}" taken from the first result (there is no seller endpoint) [PROPOSED, SF-Q-2].
Acceptance:
1. A search never sends an invalid parameter combination (attribute filters without category, relevance without `q`, `q` < 2 chars).
2. Typo-tolerant matches appear (backend behaviour; nothing to do in the UI beyond passing `q`).

### SF-04 Product listing (shared by SF-01…SF-03)

**URL parameters ↔ API parameters** [PROPOSED URL names]:

| URL | API | Validation in the UI (invalid → parameter dropped) |
|---|---|---|
| `q` | `q` | trimmed, 2..100 |
| (route) `/c/[slug]` or `category=<slug>` | `categoryId[eq]` | slug must exist in the tree |
| `minPrice`, `maxPrice` | `price[gte]`, `price[lte]` | money pattern `^\d{1,10}(\.\d{1,2})?$`; if both set and min > max, swap them |
| `inStock=1` | `inStock[eq]=true` | only `1` |
| `seller=<uuid>` | `sellerId[eq]` | UUID |
| `attr.<code>=a,b` | `attr.<code>[in]=a,b` | only codes and option codes returned by `GET /categories/{id}/attributes`; at most 5 attributes and 20 values per attribute [SPEC 06]; ignored without a category |
| `sort` = `newest` · `price-asc` · `price-desc` · `best-match` | `-publishedAt` · `minPrice` · `-minPrice` · `-relevance` | `best-match` only with `q` |
| (internal) | `limit=20`, `cursor` | cursor never put in the URL |

**Filter panel** (desktop sidebar, mobile sheet "Filters"):
- Price: two money inputs "Min" / "Max" (EGP), applied on "Apply". Note: filters on the product's **lowest variant price** [SPEC 06].
- "In stock only" checkbox.
- One checkbox group per attribute (name, then options in API order). Only when a category is selected.
- "Clear all" removes every filter (keeps `q` and category).
- Active filters shown as removable chips above the list.

**Sort select:** labels "Newest", "Price: low to high", "Price: high to low", "Best match" (only with `q`).

**Product card** (no images):
- Product name (link to `/p/[slug]`), price (`minPrice`, or range `minPrice – maxPrice` when they differ), seller business name (link to `/search?seller=<id>`), category name, "Out of stock" badge when `inStock = false`.
- Whole card is one link target for the product; the seller link is a separate focusable link.

**Paging:** first 20 items server-rendered; "Load more" appends the next page (`meta.nextCursor`) while `meta.hasMore`.

States:
- Loading (filter change): list dims and shows a progress bar; previous results stay until the new ones arrive.
- Empty: "No products match your search." + "Clear filters" (when filters are set).
- `INVALID_QUERY` / `INVALID_CURSOR`: reset to defaults per `00-conventions.md` §4.
Acceptance:
1. Every URL state maps to exactly one API request; invalid URL values are dropped, never sent.
2. "Load more" never shows duplicates or skips items (cursor from the last page).
3. Browser Back restores the previous filter set and its results.

### SF-05 Product detail

Route: `/p/[idOrSlug]` · Access: public · Render: server, `no-store` (stock and visibility are live)
Data: `GET /products/{idOrSlug}`.
- Accessed by id (e.g. from an order item) → permanent redirect to `/p/<slug>` [PROPOSED].
- `PRODUCT_NOT_FOUND` → SF-21 with the text "This product isn't available any more." (covers hidden, deleted and suspended-seller products [SPEC 06]).

Content:
1. Breadcrumbs from `category.path` (root → product category; the last entry is the product's own category [VERIFIED]).
2. Name (h1).
3. "Sold by {seller.businessName}" → `/search?seller=<id>`.
4. Price block:
   - No full selection yet: range `minPrice – maxPrice` (or one value).
   - Variant selected: its `price`; if `compareAtPrice` is not null, show it struck through ("Was EGP …") [SPEC 06: compare-at is always greater than price].
5. Variant selector: one control per entry of `attributes` (order as returned); each lists its `options` in the returned order (only options used by active variants are returned [SPEC 06]).
   - An option that, combined with the other current selections, matches no variant is shown disabled ("Not available in this combination").
   - An option whose only matching variants are out of stock is selectable and shows "Out of stock".
   - A product whose category has no attributes has a single default variant with `options: []` → no selector; that variant is selected [SPEC 06 UC-CA-4].
   - If every attribute has exactly one option, it is preselected.
   - The selected variant id is reflected in the URL as `?variant=<id>` (shareable, used after login) [PROPOSED].
6. Availability line for the selected variant: "In stock" or "Out of stock". The exact quantity is not displayed [PROPOSED, SF-Q-3].
7. Quantity stepper: 1 … min(`availableQuantity`, 99); hidden when out of stock.
8. "Add to cart" button (SF-05-A1).
9. Description (plain text, line breaks preserved, max 5000 chars).
10. Details list: SKU of the selected variant [PROPOSED].

Actions:
- **SF-05-A1 Add to cart.** Enabled only when a variant is selected and in stock.
  - Signed out (FQ-6): navigate to `/login?returnTo=/p/<slug>?variant=<id>&qty=<n>`. After sign-in the shopper is back on the product with the variant and quantity preselected and presses "Add to cart" again. Nothing is added automatically.
  - Signed in: `POST /cart/items { variantId, quantity }` → `201 CartDto` → update the cart cache and badge; show a confirmation panel "Added to cart" with "View cart" and "Continue shopping".
  - Errors:

| Code | Behaviour | Message |
|---|---|---|
| `VARIANT_NOT_PURCHASABLE` | Refetch the product | "This option isn't available any more." |
| `INSUFFICIENT_STOCK` | Refetch the product; the stepper max follows the new `availableQuantity` | "Only {available} left. Please lower the quantity." (`available` from `details[0].message`, format `available: <n>` [SPEC 08]) [ASSUMPTION about parsing; prefer the refetched `availableQuantity`] |
| `CART_ITEM_QUANTITY_LIMIT` | – | "You can have at most 99 of this item in your cart." (the limit counts what is already in the cart [SPEC 08 CT-4]) |
| `CART_LINE_LIMIT_REACHED` | – | "Your cart is full (50 different items). Remove something to add this." |
| ambiguous failure (network/5xx) | **No automatic retry** (adds are summed, no idempotency key [SPEC 08 CT-5]); refetch the cart and tell the user | "We couldn't confirm this was added. Check your cart." |

SEO [PROPOSED]: `<title>{name} | Nile`, meta description = first 160 characters of the description, canonical `/p/<slug>`, JSON-LD `Product` with `offers` (`priceCurrency: EGP`, `lowPrice`/`highPrice`, `availability`).
Acceptance:
1. The price shown always belongs to the selected variant, or is the product range when none is selected.
2. A combination that doesn't exist can't be added.
3. Signed-out "Add to cart" returns the user to the same product, variant and quantity after sign-in.
4. Hidden or deleted products return the not-found page with HTTP 404.

---

## 4. Cart and checkout

### SF-06 Cart

Route: `/cart` · Access: customer · Render: shell + client
Data: `GET /cart` (no cache; refetch on focus).
Content:
1. One group per seller (`sellers[]`, order as returned): heading "Sold by {businessName}", its lines, "Subtotal {subtotal}".
2. Line: product name (link `/p/<productSlug>`), attributes as "Size: M · Color: Red", SKU, unit price, quantity stepper, line total, remove button, and the issue notice when `issue` is not null.
3. Summary: "Items ({itemCount})" = `itemsTotal`; "Delivery: calculated at checkout" (fee depends on the address [SPEC 08]); "Proceed to checkout"; "Empty cart".

Line issues [SPEC 08 UC-CT-1]:

| `issue` | Notice | Allowed actions |
|---|---|---|
| `UNAVAILABLE` | "This item is no longer available." | Remove only (quantity stepper disabled; changing it would fail [SPEC 08 CT-4]) |
| `OUT_OF_STOCK` | "Out of stock." | Remove; stepper disabled |
| `INSUFFICIENT_STOCK` | "Only {availableQuantity} available." + button "Set to {availableQuantity}" | Change quantity (max `availableQuantity`), remove |

Lines with issues are shown with their line total but are **not** counted in subtotals and totals [SPEC 08 CT-6]; a note under the summary says "Items with a problem aren't included in the total."

Actions:
- Change quantity: debounced 500 ms after the last change, `PATCH /cart/items/{itemId} { quantity }` (1..min(availableQuantity, 99)) → replace the cart cache with the response. Errors: `CART_ITEM_NOT_FOUND` → refetch; `INSUFFICIENT_STOCK` / `VARIANT_NOT_PURCHASABLE` → refetch and show the line issue.
- Remove: `DELETE /cart/items/{itemId}` → `204` → refetch cart. No confirmation [PROPOSED].
- Empty cart: confirmation dialog "Remove all items from your cart?" → `DELETE /cart` → `204` → empty state.
- Proceed to checkout: enabled only if the cart has at least one line and `hasIssues = false`; otherwise disabled with "Fix the items marked above to continue."

States: empty (`sellers` empty) → "Your cart is empty." + "Start shopping" (`/`).
Acceptance:
1. Totals displayed are exactly the API's `subtotal`, `itemsTotal`, `itemCount` (never recomputed).
2. Checkout is impossible while any line has an issue.
3. Quantity can't be set above 99 or above the available quantity.

### SF-07 Checkout

Route: `/checkout` · Access: customer · Render: shell + client
Data (in parallel): `GET /cart`, `GET /me/addresses`, `GET /governorates`.
Entry guard: empty cart → redirect `/cart`; `hasIssues` → redirect `/cart` with the notice "Some items in your cart need attention."

One page, three sections [PROPOSED single page]:

**1. Delivery address**
- Radio list of the customer's addresses (default first, as returned [SPEC 04]). Each shows label, recipient, phone, full address and governorate name (from `GET /governorates` by `governorateId`).
- Preselection: the default address if its governorate is deliverable; otherwise nothing.
- Address in a governorate with `deliveryFee = null` (`isDeliverable = false`): shown disabled with "We don't deliver to {governorate} yet." [SPEC 11, Q-26].
- "Add a new address": opens the address form (SF-16 form) in a dialog; on success the new address is selected. Limit reached → `ADDRESS_LIMIT_REACHED` message "You have the maximum of 20 addresses. Edit or delete one in your account."
- No addresses → the form is shown inline.

**2. Payment method** — radio, no preselection [PROPOSED, SF-Q-4]:
- "Cash on delivery" (`cod`): "Pay the delivery agent in cash when your order arrives."
- "Pay by card (Kashier)" (`kashier`): "You'll be redirected to Kashier's secure page. You have {15} minutes to pay; until then your items are reserved." (15 = backend `KASHIER_PAYMENT_TTL_MINUTES` [SPEC 09]; shown as a constant from config, SF-Q-5).

**3. Review**
- Items grouped by seller (from the cart), with a note when there are several sellers: "Your order will be delivered in {n} separate parcels, one per seller. You pay one delivery fee." [SPEC 00 §1, Q-24]
- Items total = `cart.itemsTotal`.
- Delivery fee = selected address's governorate `deliveryFee` ("—" until an address is chosen).
- **Total = itemsTotal + deliveryFee**, computed with decimal arithmetic; this exact string is sent as `expectedTotal` [SPEC 09 S-8, OQ-15].
- "Place order" button, enabled when an address and a payment method are selected.

Action **SF-07-A1 Place order**:
1. On click, create the idempotency key (if none exists for this exact body) and send `POST /checkout { addressId, paymentMethod, expectedTotal }` with `Idempotency-Key`.
2. Button shows "Placing your order…"; the page cannot be submitted twice.
3. Success `201 CheckoutResultDto`:
   - Invalidate cart queries (the cart is now empty [SPEC 09]).
   - COD → `/checkout/confirmation/{order.id}`.
   - Kashier with `kashier.checkoutUrl` → store `order.id` in `sessionStorage` (`nile.pendingPaymentOrderId`), then `window.location.assign(checkoutUrl)` after checking it is `https:`.
   - Kashier with `checkoutUrl = null` → `POST /orders/{id}/payment/kashier-session`; success → as above; failure → `/account/orders/{id}` where "Pay now" is offered (SF-18).
4. Errors:

| Code | Behaviour | Message |
|---|---|---|
| `CART_EMPTY` | Redirect `/cart` | "Your cart is empty." |
| `CART_HAS_ISSUES` | Redirect `/cart` (issues visible there) | "Some items are no longer available." |
| `INSUFFICIENT_STOCK` | Redirect `/cart` | "Some items don't have enough stock any more." |
| `ORDER_TOTAL_CHANGED` | Refetch cart and governorates; show the new total in a dialog; the user confirms again (new body → **new** idempotency key) | "Prices or the delivery fee changed. Your new total is {total}." |
| `ADDRESS_NOT_FOUND` | Refetch addresses; clear the selection | "This address no longer exists. Please choose another." |
| `GOVERNORATE_NOT_DELIVERABLE` | Refetch governorates; mark the address as not deliverable | "We don't deliver to this area any more." |
| `ORDER_PAYMENT_PENDING` (Kashier) | Dialog with link to `/account/orders/{details[0].value}` | "You already have an order waiting for card payment. Pay for it or wait until it expires before placing another card order." [SPEC 09 OR-16] |
| `RATE_LIMITED` | Countdown per conventions | – |
| `IDEMPOTENCY_REQUEST_IN_PROGRESS`, network, `5xx` | Retry with the **same** key (conventions §6); a replayed `201` is handled as success | – |

States: loading skeleton for the three sections; any of the three reads failing → error block with retry for the page.
Acceptance:
1. `expectedTotal` equals `itemsTotal + deliveryFee` exactly (decimal), as displayed.
2. Double click, refresh during submit, or a network retry never creates two orders.
3. A changed total is never charged without the shopper confirming the new amount.
4. A non-deliverable address can't be used.
5. The Kashier URL is only followed if it is `https:`.

### SF-08 Order confirmation (COD)

Route: `/checkout/confirmation/[orderId]` · Access: customer · Render: shell + client
Data: `GET /orders/{orderId}` (`ORDER_NOT_FOUND` → SF-21).
Content: "Thank you. Your order {orderNumber} is placed."; payment line "Pay {total} in cash on delivery."; per seller: business name, items, "Waiting for the seller to confirm"; delivery address; buttons "View order" (`/account/orders/{id}`) and "Continue shopping".
- If the order is not `placed`/`in_progress` (e.g. visited later), show the same page with the current status label (SF-18 copy) [PROPOSED].
Acceptance: the page shows only data from `GET /orders/{id}`.

### SF-09 Kashier payment return

Route: `/checkout/payment-return` (backend `KASHIER_REDIRECT_URL`, OQ-2) · Access: customer · Render: client
Logic:
1. **Ignore every query parameter** for the outcome (the webhook is authoritative [SPEC 09 OR-11]).
2. Order id = `sessionStorage['nile.pendingPaymentOrderId']`; if missing: `GET /orders?status[in]=pending_payment,placed&limit=1` (newest first) and use that order if it was created within the last hour [PROPOSED heuristic]; if none: show "We couldn't find your order." + link to `/account/orders`.
3. Poll `GET /orders/{id}` every 3 s while visible:
   - `status = placed` or later → clear the stored id → "Payment received. Your order {orderNumber} is placed." + order summary + "View order".
   - `status = cancelled` → clear the stored id → "Your payment wasn't completed in time and the order was cancelled." + "Buy again" (SF-18-A3) + "Continue shopping". (The cart was emptied at checkout [SPEC 09].)
   - still `pending_payment` and now < `paymentExpiresAt` → "Confirming your payment…" with the countdown and a "Pay now" button (SF-18-A2) in case the payment was not finished.
   - still `pending_payment` after `paymentExpiresAt` + 2 min [PROPOSED] → stop polling: "We're still waiting for confirmation from the payment provider. Check your order page in a few minutes." + link.
- The page requires sign-in; with `SameSite=Lax` the session cookie is sent on Kashier's top-level redirect [ASSUMPTION, verified in T-F4]. Signed out → login with `returnTo=/checkout/payment-return`.
Acceptance:
1. A tampered return URL (e.g. `?paymentStatus=SUCCESS`) never shows success unless the API says the order is placed.
2. Polling stops on a final state, when the tab is hidden (resumes when visible), and at the time limit.

---

## 5. Authentication screens

Shared rules: every auth form is rate-limited by the backend (`strict-auth`) → `RATE_LIMITED` countdown; generic answers never reveal whether an email exists [SPEC 03]; on success with tokens the user lands on `returnTo` (validated) or `/`.

### SF-10 Sign in

Route: `/login?returnTo=&email=&notice=` · Access: public
Fields: Email (`email`, ≤ 254), Password (1..72 bytes, not trimmed).
Action: `POST /api/auth/login` (BFF → `POST /auth/login` with `deviceName` = "Web (storefront)" [PROPOSED]).

| Result | Behaviour | Message |
|---|---|---|
| Success, role `customer` | Session created → redirect | – |
| Success, other role | Session discarded by the BFF; no redirect | "This is a {seller/admin/delivery} account. Please use the {seller/admin/delivery} site." with a link from config [PROPOSED] |
| `INVALID_CREDENTIALS` | Form alert | "Email or password is incorrect." |
| `EMAIL_NOT_VERIFIED` | Redirect to `/verify-email?email=<email>&returnTo=…` | "Please verify your email first." |
| `ACCOUNT_SUSPENDED` | Form alert | "This account is suspended." |

Links: "Forgot password?" → `/forgot-password?email=<typed email>`; "Create account" → `/register?returnTo=…`.
`notice` values [PROPOSED]: `password-reset` → "Your password was changed. Please sign in."; `session-ended` → "Your session has ended. Please sign in again."; `invited` → not used here (agent/admin apps).

### SF-11 Create account

Route: `/register?returnTo=` · Access: public
Fields [VERIFIED `RegisterCustomerDto`]:

| Field | Rules |
|---|---|
| First name | required, trimmed, 1..100 |
| Last name | required, trimmed, 1..100 |
| Email | required, email, ≤ 254, lower-cased |
| Mobile phone | required, Egyptian mobile (conventions §5) |
| Password | required, ≥ 8 characters, ≤ 72 bytes, not trimmed; no other composition rules [SPEC 01] |
| Confirm password | must equal Password (UI-only check) [PROPOSED] |

Action: `POST /auth/register/customer` (via BFF) → `201` (no tokens) → `/verify-email?email=<email>&returnTo=…`.
Errors: `EMAIL_ALREADY_REGISTERED` → email field "An account with this email already exists." + link "Sign in" / "Forgot password?".
Acceptance: no session exists after registration until the email is verified [SPEC 04 UC-CU-1].

### SF-12 Verify email

Route: `/verify-email?email=&returnTo=` · Access: public
Content: "We sent a 6-digit code to {email}. It expires in 10 minutes." [SPEC 03 S-16]; code input (6 digits, numeric keyboard, paste supported); "Change email" link → `/register`.
Actions:
- Verify: `POST /auth/email/verify { email, otp }` (via BFF, creates the session) → redirect to `returnTo` or `/`. `INVALID_OTP` → "This code is invalid or has expired." (also after 5 wrong attempts [SPEC 03]; then the user must request a new code).
- Resend: `POST /auth/email/resend-otp { email }` → always the same generic answer → toast "If this email needs verification, a new code is on its way."; the button is disabled for 60 s with a countdown (server cooldown 60 s [SPEC 03]; the UI timer is cosmetic).
- Missing `email` param → an email field is shown first.
Acceptance: the screen never states whether the email exists.

### SF-13 Forgot password

Route: `/forgot-password?email=` · Fields: Email.
Action: `POST /auth/password/forgot` → always generic → go to `/reset-password?email=<email>` with the notice "If an active account uses this email, we sent a reset code." [VERIFIED message].

### SF-14 Reset password

Route: `/reset-password?email=` · Fields: Email (prefilled), Code (6 digits), New password, Confirm new password.
Actions:
- Reset: `POST /auth/password/reset { email, otp, newPassword }` → `204` → `/login?notice=password-reset&email=<email>` (all sessions were revoked [SPEC 03]).
- "Send a new code": same as SF-13 action, 60 s cooldown.
Errors: `INVALID_OTP` → "This code is invalid or has expired."

---

## 6. Account screens

Shared: account pages have a side menu (desktop) / tabs (mobile): Profile, Addresses, Orders, Security, Sign out.

### SF-15 Profile

Route: `/account` · Data: `GET /me`.
Content/fields: Email (read-only, note "Email can't be changed."), First name, Last name, Mobile phone (rules as SF-11), "Member since {createdAt date}".
Action: Save → `PATCH /me` with **only changed fields**; button disabled when nothing changed → `200 CustomerProfileDto` → update cache (header greeting too) → toast "Profile saved."

### SF-16 Addresses

Route: `/account/addresses` · Data: `GET /me/addresses` (≤ 20, default first, then newest [SPEC 04]), `GET /governorates`.
Content: one card per address: label, "Default" badge, recipient name and phone, `building, street, area, city, governorate`, floor/apartment/landmark when present, a "Not deliverable yet" note when the governorate's fee is null. Actions per card: Edit, Delete, "Make default" (non-default only). "Add address" button (hidden at 20 with the note "You can save up to 20 addresses.").

Address form (create and edit) [VERIFIED `CreateAddressDto`]:

| Field | Rules |
|---|---|
| Label (e.g. Home) | required, 1..50 |
| Recipient name | required, 1..100 |
| Recipient phone | required, Egyptian mobile |
| Governorate | required, select of all 27 from `GET /governorates`; non-deliverable ones marked "(no delivery yet)" but selectable [SPEC 04] |
| City | required, 1..100 |
| Area | required, 1..100 |
| Street | required, 1..200 |
| Building | required, 1..50 |
| Floor | optional, 1..10, nullable |
| Apartment | optional, 1..10, nullable |
| Landmark | optional, 1..200, nullable |
| Make this my default address | checkbox (create: sent as `isDefault`; edit: shown only for a non-default address) |

Rules shown to the user:
- Create: when the customer has no default address, the new one becomes the default whatever the checkbox says [SPEC 04 C-3]; the form shows "This will be your default address." in that case.
- Edit: the default address has no "unset default" control (unsetting fails with `DEFAULT_ADDRESS_UNSET_NOT_ALLOWED` [SPEC 04]); to change the default, "Make default" on another address.
- Optional fields cleared on edit are sent as `null`.

Actions:
- Create `POST /me/addresses` → `201` → refetch list. Errors: `ADDRESS_LIMIT_REACHED`, `GOVERNORATE_NOT_FOUND` (refetch governorates).
- Edit `PATCH /me/addresses/{id}` (changed fields only) → `200`. Errors: `ADDRESS_NOT_FOUND` (refetch), `GOVERNORATE_NOT_FOUND`, `DEFAULT_ADDRESS_UNSET_NOT_ALLOWED`.
- Make default `PATCH /me/addresses/{id} { isDefault: true }` → refetch.
- Delete: confirm "Delete this address? Past orders keep their delivery address." [SPEC 04] → `DELETE /me/addresses/{id}` → `204` → refetch. If it was the default, the list shows no default afterwards and a hint "Choose a default address." [SPEC 04: no automatic promotion].
States: empty → "You haven't saved any addresses yet." + "Add address".

### SF-17 Orders

Route: `/account/orders?status=` · Data: `GET /orders` with `limit=20`, cursor, default sort `-createdAt`.
Status tabs [PROPOSED grouping]:

| Tab | `status[in]` |
|---|---|
| All | – |
| Awaiting payment | `pending_payment` |
| In progress | `placed,in_progress` |
| Completed | `completed,partially_completed` |
| Cancelled | `cancelled` |

Row: order number, date (`createdAt`), status badge, payment method, "{itemCount} items from {sellerOrderCount} sellers", total. Row links to SF-18.
States: empty → "You haven't placed any orders yet." (All) / "No orders here." (other tabs).

### SF-18 Order detail

Route: `/account/orders/[orderId]` · Data: `GET /orders/{orderId}` (`ORDER_NOT_FOUND` → SF-21). Refetch every 30 s while visible **only** while the order is `pending_payment` [PROPOSED]; otherwise refetch on focus.
Content:
1. Header: "Order {orderNumber}", placed date, status badge.
2. Payment: method label, payment status label (§7.3), and when `status = pending_payment`: countdown to `paymentExpiresAt` + "Pay now" (A2).
3. Delivery address (`shippingAddress`, governorate name included).
4. One block per seller order: business name, status badge, items, subtotal, timeline (`timeline[]` status + time, oldest first), "Cancel" when `canCancel` (A1).
   - Item: product name (link `/p/{productId}`, which redirects to the slug; may show "no longer available" [PROPOSED]), attributes, SKU, unit price × quantity, line total; when `cancelledQuantity > 0`: "{cancelledQuantity} cancelled by the seller" and the open quantity [SPEC 09: item cancellation is seller-only].
5. Totals: items total (`itemsTotal`), delivery fee (`deliveryFee`), total (`total`), with the notes:
   - "Cancelled or returned parcels aren't included in the total." when any seller order is `cancelled` or `returned_to_seller` [SPEC 09 OR-13].
   - "No delivery fee is charged because nothing was delivered." when the order is `cancelled` and `deliveryFee = 0.00` [SPEC 00 Q-28].
   - Card payments with refunds: "Refunds for card payments are processed by our team." when `paymentStatus` is `paid` or `partially_refunded_manually` and something was cancelled [SPEC 00 §1; PROPOSED copy].

Actions:
- **A1 Cancel a seller order** (only when `canCancel = true`: seller order `placed`, order not awaiting payment [SPEC 09 OR-9]): dialog "Cancel the items from {businessName}? This can't be undone." + optional note (1..500, "Reason (optional)"); card payments add "Your refund will be processed by our team." → `POST /orders/{orderId}/seller-orders/{sellerOrderId}/cancel { note? }` with `Idempotency-Key` → `200 OrderDetailDto` → replace cache. Errors: `SELLER_ORDER_NOT_CANCELLABLE` → refetch + "The seller has already confirmed this part of your order, so it can't be cancelled here." ; `SELLER_ORDER_NOT_FOUND` → refetch.
- **A2 Pay now** (Kashier, `pending_payment`, before `paymentExpiresAt`): `POST /orders/{id}/payment/kashier-session` → store the order id in `sessionStorage` → redirect to `checkoutUrl` (https only). Errors: `ORDER_NOT_AWAITING_PAYMENT` → refetch + "This order is no longer waiting for payment."; `PAYMENT_PROVIDER_UNAVAILABLE` → "The payment provider isn't responding. Please try again in a moment."; `RATE_LIMITED` → countdown.
- **A3 Buy again** (SF-Q-12; shown only when the order `status = cancelled`): confirmation "Add the items from this order to your cart? Current prices apply." → for each item of the order with an open quantity `q = quantity − cancelledQuantity` > 0, in order, `POST /cart/items { variantId, quantity: q }` **one at a time** (no parallel calls, no automatic retry: adds have no idempotency key [SPEC 08 CT-5]) → a result dialog listing each item as "Added" or the reason it wasn't (`VARIANT_NOT_PURCHASABLE` "No longer available", `INSUFFICIENT_STOCK` "Not enough stock", `CART_ITEM_QUANTITY_LIMIT` "Would exceed 99 in your cart", `CART_LINE_LIMIT_REACHED` "Your cart is full"; after `CART_LINE_LIMIT_REACHED` the remaining items are skipped) → "Go to cart". A network failure stops the run and tells the user to check the cart. Prices are the current ones, never the order's [SPEC 08: cart reads prices live].
Acceptance:
1. Cancel is offered exactly when `canCancel` is true.
2. Amounts shown are the API's values, never recomputed.
3. Pay now is not offered after `paymentExpiresAt`.
4. Buy again sends one add per item with an open quantity, sequentially, and reports every item's outcome.

### SF-19 Security

Route: `/account/security`
Content: Change password form; "Sign out" button; note "Changing your password signs you out on your other devices." [SPEC 03].
Fields: Current password (1..72 bytes), New password (≥ 8, ≤ 72 bytes), Confirm new password.
Action: `POST /api/auth/password/change` (the BFF adds the session's refresh token) → `204` → toast "Password changed." (this session stays signed in).
Errors: `INVALID_CURRENT_PASSWORD` → field "Current password is incorrect."; `PASSWORD_UNCHANGED` → field "Choose a password different from your current one."; `INVALID_REFRESH_TOKEN` → session ended (conventions §2).

### SF-20 Invite landing (admins and delivery agents)

Route: `/invite?token=` · Access: public (not linked from the storefront UI) · Design: `architecture.md` §5.7
1. Read `token` (43 characters, else "This invitation link is invalid."), then remove it from the address bar.
2. Form: New password, Confirm password (rules as SF-11).
3. `POST /api/auth/invite { token, password }` → the BFF accepts, reads the role, logs the session out at once, sets **no** cookie → answers `{ role }`.
4. Redirect to the admin or agent app: `<app>/login?notice=invited&email=<email>` (app URLs from config).
Errors: `INVALID_INVITE_TOKEN` → "This invitation has expired or was already used. Ask an admin to send a new one." (invites last 72 h [SPEC 03]).
Acceptance: the storefront never holds a session for an admin or agent; the token never appears in logs.

### SF-21 Not found and errors

- Not found (HTTP 404): "We couldn't find this page." + search box + link home. Product variant text per SF-05.
- Unexpected error (`error.tsx`): "Something went wrong." + "Try again" + reference id.

---

## 7. Copy

### 7.1 Order status (`OrderStatus`) [PROPOSED wording]

| Value | Label |
|---|---|
| `pending_payment` | Awaiting payment |
| `placed` | Placed |
| `in_progress` | In progress |
| `completed` | Delivered |
| `partially_completed` | Partially delivered |
| `cancelled` | Cancelled |

### 7.2 Seller order status (`SellerOrderStatus`), customer view [PROPOSED wording]

| Value | Label |
|---|---|
| `pending_payment` | Awaiting payment |
| `placed` | Waiting for seller confirmation |
| `accepted` | Confirmed by seller |
| `ready_for_pickup` | Being prepared for delivery |
| `picked_up` | Picked up by courier |
| `out_for_delivery` | Out for delivery |
| `delivery_failed` | Delivery attempt failed — we'll try again |
| `returning_to_seller` | Returning to seller |
| `returned_to_seller` | Returned to seller |
| `delivered` | Delivered |
| `cancelled` | Cancelled |

### 7.3 Payment

| Value | Label |
|---|---|
| `cod` | Cash on delivery |
| `kashier` | Card (Kashier) |
| `pending` | To be paid on delivery |
| `partially_collected` | Partly paid on delivery |
| `collected` | Paid on delivery |
| `cancelled` (COD) | Not charged |
| `initiated` | Awaiting payment |
| `paid` | Paid |
| `failed` | Payment failed |
| `expired` | Payment window expired |
| `partially_refunded_manually` | Partly refunded |
| `refunded_manually` | Refunded |

### 7.4 Error messages

Storefront-specific messages are listed in each screen; everything else uses `00-conventions.md` §4.

## 8. Non-functional requirements (storefront)

- SEO [PROPOSED]: server-rendered catalog; canonical URLs (`/c/<slug>`, `/p/<slug>`); filtered/sorted/search URLs `noindex, follow` with canonical to the unfiltered page; account, cart, checkout and auth pages `noindex`. No sitemap in R1 (SF-Q-6).
- Performance budgets (phase i): LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on catalog, product and cart pages (mid-range mobile profile).
- Accessibility: WCAG 2.2 AA (conventions §10); variant selector and quantity stepper fully keyboard-operable with announced state.
- Polling limits: only SF-09 (3 s) and SF-18 while `pending_payment` (30 s), only while visible (mind the shared-IP rate limit until OQ-1 is fixed).

## 9. Questions (all answered 2026-10-14: the recommendation was accepted for each)

| # | Question | Options (recommendation first = decision) |
|---|---|---|
| SF-Q-1 | Home page content (no CMS, no featured-products endpoint) | **Search + top-level category tiles + 12 newest products (Rec)** · categories only · something else you specify |
| SF-Q-2 | Seller storefront | **`/search?seller=<id>` titled with the business name from the first result (Rec)** · no seller pages · ask the backend for a public seller endpoint |
| SF-Q-3 | Show stock quantity on the product page? | **No, only In stock / Out of stock and the quantity cap (Rec)** · show "Only N left" below a threshold you choose |
| SF-Q-4 | Default payment method at checkout | **None preselected, the shopper must choose (Rec)** · COD preselected · card preselected |
| SF-Q-5 | The 15-minute card payment window shown in copy | **Constant in storefront config, kept equal to the backend env by convention (Rec)**; the actual deadline always comes from `paymentExpiresAt` · don't mention the duration |
| SF-Q-6 | Sitemap | **Not in R1 (Rec)**: would need paging through all products · generated nightly from `GET /products` |
| SF-Q-7 | Checkout layout | **Single page with three sections (Rec)** · multi-step wizard |
| SF-Q-8 | Footer and legal pages (terms, privacy, contact) | **Minimal footer now; you provide the texts later (Rec)** · placeholders now |
| SF-Q-9 | Product URL by id from order items | **Accept id or slug, redirect id → slug (Rec)** · don't link order items |
| SF-Q-10 | Brand name in UI and titles | **"Nile" (Rec, as in the backend email templates)** · another name |
| SF-Q-11 | URL names for filters (`minPrice`, `attr.color`, `sort=price-asc`, …) | **As in SF-04 (Rec)** · mirror API names exactly |
| SF-Q-12 | After an expired/failed card payment the order is cancelled and the cart is already empty | **Show the cancelled order with a "Buy again" button that adds its still-purchasable items back via `POST /cart/items` one by one, reporting any that fail (Rec, uses only existing endpoints; not in R1 scope unless you approve)** · nothing: the shopper re-adds items manually |

All [PROPOSED] items in this spec were accepted with v1.0.
