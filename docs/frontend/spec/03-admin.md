# Spec 03 — Admin console

Status: **v1.0 APPROVED (2026-10-14).** Approved by the user with every recommendation in §6 (AD-Q-1…AD-Q-9) and every [PROPOSED] item. Changes from now on need explicit approval and a version bump.
Conventions: `00-conventions.md` v1.0. Backend specs cited as [SPEC nn] = `../nile-marketplace2/docs/spec/<nn>-*.md`; [VERIFIED] = running API / OpenAPI / backend code.
App: `apps/admin`, dev port 4102. Access roles: public (sign-in, password reset), `admin`. Screen ids `AD-nn` (two digits; the workflow ids in `workflows.md` are `AD-n`).

---

## 1. Scope

**In scope:** admin sign-in and password reset (accounts are created by invitation, accepted on the storefront `/invite` landing, spec 01 SF-20); dashboard of work queues; admin accounts; sellers and commission; catalog structure (categories, attributes, options); delivery setup (governorate fees, agent fee share); delivery agents; shipments and assignment; orders; payments and the manual-refund queue; finance (accounts, statements, COD remittances, payouts).

**Out of scope (and why):**

| Item | Reason |
|---|---|
| Suspending/reactivating **customers**; resending an **agent's** invite | Those endpoints take a `userId`, which the API never exposes for customers or agents (OQ-7, gap accepted for R1). Admin accounts only |
| Customer list or search, customer profiles | No admin customer endpoint; orders expose only `customerId` |
| Cancelling orders or seller orders | Not in R1 [SPEC 09 S-9] |
| Reassigning a shipment after pickup | Not in R1 [SPEC 11 S-18] |
| Moving or deleting categories | Not in R1 [SPEC 06] |
| Editing products, prices or stock of sellers | Seller-owned; no admin endpoint |
| Issuing refunds | Refunds are made by hand in the Kashier dashboard; the console only **records** them [SPEC 10 UC-PA-4] |
| Payment lists, revenue reports, charts, counts | No endpoints (refund queue and per-order payments only) |
| Webhook payloads | Not exposed (events without payloads) [SPEC 10] |

## 2. Global elements

### 2.1 Layout [PROPOSED, AD-Q-8]

Desktop-first (≥ 1280 px primary, usable at 768 px; phones show a "best on a larger screen" note but work). Sidebar groups:
- **Dashboard**
- **Marketplace:** Sellers · Orders · Refunds
- **Catalog:** Categories
- **Delivery:** Shipments · Agents · Delivery settings (governorates + agent share)
- **Finance:** Accounts · COD remittances · Payouts · Reference lookup
- **Settings:** Commission · Admins
- Account menu: email of the signed-in admin, Security, Sign out.

### 2.2 Shared behaviour

- **Name and label lookups** (no name fields in many DTOs):
  - Governorate names: `GET /admin/governorates` (27, cached for the session).
  - Agent names on remittances and shipments: `GET /admin/delivery-agents/{id}` per **unique** id on the visible page, cached 5 min [PROPOSED, AD-Q-3].
  - Seller names on payouts and accounts: accounts already carry `ownerName`; payouts resolve `GET /admin/sellers/{id}` per unique id on the page, cached 5 min.
- **History actors** (`actorUserId`, `actorRole`): shown as the role label; "you" when the id equals the signed-in admin; an admin's email when the id is found in the admins list (`GET /admin/admins`, small, cached 5 min); otherwise the role only [PROPOSED, AD-Q-2].
- **Rates** (`"0.1000"` strings) are edited and shown as percentages: input 0–100 with up to 2 decimals (`12.5` → `"0.1250"`), conversion with decimal arithmetic; the API accepts up to 4 decimals of a fraction [VERIFIED rate pattern].
- **Money inputs**: EGP decimal strings, up to 10 integer digits and 2 decimals; "greater than 0" where the API requires it.
- **Money actions** (refund record, COD remittance, payout) use an `Idempotency-Key` per confirmed intent and a summary confirmation dialog [PROPOSED, AD-Q-5].
- **Ids** are shown shortened (first 8 characters) with a copy button.

### 2.3 Route map

| Route | Screen |
|---|---|
| `/login`, `/forgot-password`, `/reset-password` | AD-01 Auth |
| `/` | AD-02 Dashboard |
| `/admins` | AD-03 Admins |
| `/sellers`, `/sellers/[sellerId]` | AD-04 Sellers, AD-05 Seller |
| `/settings/commission` | AD-06 Default commission |
| `/catalog/categories` | AD-07 Categories (tree + panel) |
| `/delivery/settings` | AD-08 Governorates and agent share |
| `/delivery/agents`, `/delivery/agents/new`, `/delivery/agents/[agentId]` | AD-09, AD-10, AD-11 |
| `/delivery/shipments`, `/delivery/shipments/[shipmentId]` | AD-12, AD-13 |
| `/orders`, `/orders/[orderId]` | AD-14, AD-15 |
| `/refunds` | AD-16 Refund queue |
| `/payments/[paymentId]` | AD-17 Payment |
| `/finance/accounts`, `/finance/accounts/[accountId]` | AD-18, AD-19 |
| `/finance/remittances` | AD-20 COD remittances |
| `/finance/payouts` | AD-21 Payouts |
| `/finance/lookup` | AD-22 Reference lookup |
| `/security` | AD-23 Security |

All pages: shell + client, `no-store`, `noindex`.

---

## 3. Screens

### AD-01 Sign in and password reset
As storefront SF-10, SF-13, SF-14 with: only `role = admin` accepted (other roles: "This isn't an admin account."); `deviceName` "Web (admin)"; `notice=invited` → "Your password is set. Please sign in." (after the invite landing, spec 01 SF-20). No registration.

### AD-02 Dashboard [PROPOSED content, AD-Q-1]
Data (parallel, each `limit=5`), refetched every 60 s while visible:
1. "Sellers waiting for approval": `GET /admin/sellers?status[eq]=pending_approval&sort=createdAt` (oldest first) → link to AD-05.
2. "Unassigned shipments": `GET /admin/shipments?status[eq]=unassigned&sort=createdAt` → AD-13.
3. "Refunds to record": `GET /admin/payments/refunds?status[eq]=pending_manual` (oldest first by default) → AD-16.
4. "Agents holding COD cash": `GET /admin/finance/accounts?accountType[eq]=agent_cod_cash&balance[gt]=0` (sorted `-balance`) → AD-20 prefilled.
5. "Orders awaiting card payment": `GET /admin/orders?status[eq]=pending_payment&sort=createdAt`.
Each card: up to 5 rows and "See all". No counts (none in the API); a card with `hasMore` shows "More…". Empty: "Nothing waiting."

### AD-03 Admins

Data: `GET /admin/admins` (filters: status tabs All / Invited / Active / Suspended → `status[eq]`; sort `-createdAt`).
Row: email, status, email verified date, last login, created; actions by status.

| Action | Condition | Call | Notes |
|---|---|---|---|
| Invite admin | always | `POST /admin/admins { email }` → `201` | Dialog with email (≤ 254). `EMAIL_ALREADY_REGISTERED` → field error. Success: "Invitation sent to {email}. It's valid for 72 hours." |
| Resend invite | `status = invited` | `POST /admin/users/{id}/resend-invite` → `204` | "The previous link stops working." `USER_NOT_INVITED` → refetch |
| Suspend | `status = active` and not yourself | `POST /admin/users/{id}/suspend { reason }` | Reason 3..500, required. Dialog: "{email} will be signed out everywhere and can't sign in." `CANNOT_SUSPEND_SELF`, `USER_INVALID_STATUS_TRANSITION` → refetch |
| Reactivate | `status = suspended` | `POST /admin/users/{id}/reactivate` | |

Note on the page: "Customer accounts and delivery agents can't be suspended here." (agents: AD-11 deactivate; customers: not available, OQ-7).

### AD-04 Sellers

Data: `GET /admin/sellers` — status tabs Pending / Approved / Rejected / Suspended / All (`status[eq]`); search business name (`businessName[like]`, debounced); pickup governorate select (`pickupGovernorateId[eq]`); created date range; sort created (newest first; Pending tab oldest first [PROPOSED]).
Row: business name, email, phone, status, commission %, pickup governorate, created, approved.

### AD-05 Seller

Data: `GET /admin/sellers/{sellerId}` (`SELLER_NOT_FOUND` → not found), governorates.
Content: business name, status, email + "Email verified" / "Email not verified", phone, pickup address, commission %, created/approved dates, rejection reason, **status history** (newest first, last 50: from → to, reason, actor, date), **commission history** (last 50: old → new, actor, date). Links: "Orders" is not available per seller (no filter), "Products in store" → storefront `/search?seller={id}` (config URL), "Finance account" → AD-18 filtered `ownerId[eq]={id}&accountType[eq]=seller_payable`.

Actions (each returns `AdminSellerDetailDto` → replace cache):

| Action | Condition | Body | Dialog / errors |
|---|---|---|---|
| Approve | `pending_approval` | – | Disabled with "The seller hasn't verified their email yet." when `emailVerified = false` (`SELLER_EMAIL_NOT_VERIFIED` [SPEC 05 Q-40]). Confirm: "Approve {name}? They can start selling." |
| Reject | `pending_approval` | `reason` 3..500, required | "The seller sees this reason and can re-apply." |
| Suspend | `approved` | `reason` 3..500, required | "Their products are hidden from the store at once. Open orders continue." [SPEC 05] |
| Reinstate | `suspended` | `reason` optional 3..500 | "Their products become visible again." |
| Change commission | any status | `commissionRate` (percent input) | "Applies to new orders only." [SPEC 00 Q-6]. `COMMISSION_RATE_UNCHANGED` → field error "This is already the seller's rate." |

All transitions: `SELLER_INVALID_STATUS_TRANSITION` → refetch + default message.

### AD-06 Default commission
Data: `GET /admin/settings/commission`. Shows the rate % and `updatedAt`. Edit: percent input → `PUT /admin/settings/commission { defaultCommissionRate }`; confirm "Applies to sellers who register from now on. Existing sellers keep their own rate." [SPEC 05].

### AD-07 Categories

Data: `GET /admin/categories` (full tree incl. inactive, each node with its **own** attributes and their options). Refetch after every write.
Layout [PROPOSED, AD-Q-9]: left — tree (expand/collapse, inactive nodes greyed with an "Inactive" badge, children ordered by `sortOrder`); right — panel for the selected category.

**Category panel**
- Fields: name, slug, sort order, active toggle, depth (read-only), parent (read-only: moving isn't supported).
- **Attributes on this category** (own) and **Inherited attributes** (from ancestors, read-only, computed from the tree) with an "Effective attributes: {n} of 5" indicator [SPEC 06].
- Actions: Add subcategory (hidden at depth 3 [SPEC 06 Q-30]), Save, Add attribute.

**Create category** (root via "Add top-level category", or child of the selected node) [VERIFIED `CreateCategoryDto`]:

| Field | Rules |
|---|---|
| Name | required, 1..100; unique among siblings, case-insensitive (`CATEGORY_NAME_TAKEN`) |
| Slug | optional, 1..120, `^[a-z0-9]+(?:-[a-z0-9]+)*$`; derived from the name by the backend when empty (`CATEGORY_SLUG_TAKEN` → ask for one; `CATEGORY_SLUG_REQUIRED` when the name can't produce one → "Enter a slug (lowercase letters, numbers and hyphens).") [SPEC 06 CA-10] |
| Sort order | required, integer 0..10000 (default: one more than the largest sibling value [PROPOSED]) |

Errors: `CATEGORY_MAX_DEPTH_EXCEEDED`, `CATEGORY_CHILD_LIMIT_REACHED` ("A category can have at most 100 subcategories."), `CATEGORY_PARENT_INACTIVE` ("Activate the parent category first."), `CATEGORY_NOT_FOUND` (refetch).

**Update category**: changed fields among name, slug, sort order, isActive.
- Deactivate: allowed only without active subcategories and products → `CATEGORY_IN_USE`: "Deactivate its subcategories first, and make sure no products use it." Confirm text: "Hidden from shoppers and sellers." 
- Activate: parent must be active → `CATEGORY_PARENT_INACTIVE` [SPEC 06 CA-13]; the control is disabled with that reason when the parent is inactive.
- Slug change warning: "Changing the slug changes the category's web address." [PROPOSED]

**Add attribute** [VERIFIED `CreateAttributeDto`]: name 1..60, code 1..60 slug pattern (the shoppers' filter key; **can't be changed later**), sort order 0..10000.
- Pre-checks shown (not enforced): effective count already 5 → warning.
- Errors: `CATEGORY_HAS_PRODUCTS` → "Attributes can only be added before any product uses this category or its subcategories." [SPEC 06 S-5]; `ATTRIBUTE_CODE_CONFLICT` → "This code is already used by this category, a parent or a subcategory."; `ATTRIBUTE_LIMIT_REACHED` → "A category can have at most 5 attributes including inherited ones."

**Edit attribute**: name, sort order (`PATCH /admin/attributes/{id}`); code read-only. **Delete attribute**: confirm "Delete {name} and its options?" → `DELETE` → `ATTRIBUTE_IN_USE`: "Products in this category or its subcategories use this attribute."

**Options** (listed under each own attribute, ordered by sort order): Add [VERIFIED `CreateOptionDto`] value 1..60, code 1..60 slug (immutable), sort order → `POST /admin/attributes/{id}/options` (`OPTION_CODE_TAKEN`, `OPTION_LIMIT_REACHED` "At most 100 options."); Edit value, sort order → `PATCH /admin/options/{id}`; Delete → `DELETE /admin/options/{id}` (`OPTION_IN_USE`: "A product variant uses this option.").
Acceptance:
1. Codes can't be edited after creation (no control).
2. "Add subcategory" never appears at depth 3.
3. Activation of a child under an inactive parent is impossible from the UI.

### AD-08 Governorates and agent share

Data: `GET /admin/governorates`, `GET /admin/settings/delivery`.
1. **Agent share of the delivery fee**: percent of `agentFeeShareRate`, `updatedAt`. Edit → `PUT /admin/settings/delivery { agentFeeShareRate }`; confirm "Applies to new orders only. Nile keeps the rest of the fee." [SPEC 11 UC-DE-7].
2. **Governorates** table (27, by name): name, code, delivery fee, deliverable yes/no. Per row: "Set fee" (money ≥ 0, `PATCH /admin/governorates/{id} { deliveryFee: "…" }`) and "Stop delivering" (`{ deliveryFee: null }`, confirm "Customers can't check out to {name} until you set a fee again."). Note: "Fee changes apply to new orders only." All 27 start non-deliverable [SPEC 11 DE-2].
- `UpdateGovernorateDto.deliveryFee` is sent explicitly (string or `null`) [api-inventory OA-6]. `GOVERNORATE_NOT_FOUND` → refetch.
Acceptance: the request always contains `deliveryFee`; "Stop delivering" sends `null`.

### AD-09 Agents

Data: `GET /admin/delivery-agents` — tabs Active / Inactive / All (`status[eq]`); filters on shift (`onShift[eq]`), home governorate (`homeGovernorateId[eq]`), name search (`fullName[like]`); sort `-createdAt`.
Row: name, email, phone, home governorate, status, login status (`userStatus`: invited / active / suspended), on shift, active shipments, last assigned. "Add agent" → AD-10.

### AD-10 New agent
Fields [VERIFIED `CreateAgentDto`]: email (≤ 254), full name 1..100, phone (Egyptian mobile), home governorate (required; "New shipments picked up in this governorate are assigned to agents based here." [SPEC 00 §4.6]).
`POST /admin/delivery-agents` → `201` → AD-11 with "Invitation sent to {email}. It's valid for 72 hours."
Errors: `EMAIL_ALREADY_REGISTERED`, `GOVERNORATE_NOT_FOUND`.
Note: if the agent's invite expires, it can't be resent from the console (OQ-7); the page says so next to `userStatus = invited`.

### AD-11 Agent
Data: `GET /admin/delivery-agents/{agentId}`; active shipments `GET /admin/shipments?agentId[eq]={id}&status[in]=assigned,picked_up,out_for_delivery,delivery_failed,returning_to_seller`; COD cash and fee balances via `GET /admin/finance/accounts?ownerId[eq]={id}` (types `agent_cod_cash`, `agent_fee_payable`).
Content: profile, status, login status, on shift, active shipment count, last assigned; active shipments list; balances with shortcuts "Record COD cash received" (AD-20 prefilled) and "Record payout" (AD-21 prefilled).
Actions:
- Edit (full name, phone, home governorate) → `PATCH`; `GOVERNORATE_NOT_FOUND`.
- **Deactivate** (`active`): confirm "The agent goes off shift, gets no new work and can't sign in." → `POST …/deactivate`. `AGENT_HAS_ACTIVE_SHIPMENTS` → "Reassign or finish this agent's active shipments first." with a link to the list above [SPEC 11 UC-DE-6].
- **Activate** (`inactive`) → `POST …/activate` ("Their sign-in is restored.").
- `AGENT_INVALID_STATUS_TRANSITION` → refetch.

### AD-12 Shipments
Data: `GET /admin/shipments` — tabs Unassigned (`sort=createdAt`, oldest first) / Assigned / In delivery (`picked_up,out_for_delivery,delivery_failed`) / Returning (`returning_to_seller`) / Delivered / Returned / Cancelled / All; filters agent (picker), order id (from AD-15 links), date range.
Row: order number, status, payment method, pickup (business name, governorate), drop-off governorate, agent name (or "Unassigned"), attempts, amount to collect, created.

### AD-13 Shipment
Data: `GET /admin/shipments/{shipmentId}` (with history).
Content: status, order number (link AD-15), seller order id, payment method; pickup (business, phone, address); drop-off (recipient, phone, full address); money: COD items amount, COD fee amount, amount to collect, carries delivery fee, COD collected; agent (link AD-11) and assigned/picked-up/delivered times; attempts (number, reason label, note, time); "Seller order cancelled after pickup at …" when `sellerOrderCancelledAt` is set; history (from → to, actor, reason, time).
Action **Assign / Reassign** (status `unassigned` or `assigned` only [SPEC 11 Q-41, S-18]): dialog listing **active** agents (`GET /admin/delivery-agents?status[eq]=active`), agents based in the pickup governorate and on shift listed first, each with active shipment count; the current agent excluded → `POST …/assign { agentId }` → `200` → replace cache. Note: "You can choose any active agent, even off shift or from another governorate." [SPEC 11 UC-DE-4].
Errors: `AGENT_INACTIVE`, `AGENT_NOT_FOUND` → refetch agents; `SHIPMENT_NOT_ASSIGNABLE` → refetch ("It has been picked up already."); `SHIPMENT_ALREADY_ASSIGNED_TO_AGENT`.

### AD-14 Orders
Data: `GET /admin/orders` — status tabs (as storefront SF-17 groups, plus "All"); search by order number (`orderNumber[eq]`, exact); customer filter (`customerId[eq]`, set from AD-15 "Other orders of this customer"); date range; sort `-createdAt`.
Row: order number, created, status, payment method, total, items, seller orders, customer id (short).

### AD-15 Order
Data: `GET /admin/orders/{orderId}`; shipments `GET /admin/shipments?orderId[eq]={id}`; payment `GET /admin/orders/{orderId}/payment` (`PAYMENT_NOT_FOUND` → "No payment record").
Content:
1. Header: number, status, payment method and status, created/placed/completed/cancelled times, payment deadline when awaiting payment; customer id with "Other orders of this customer".
2. Delivery address (full).
3. Totals: items total, delivery fee, total.
4. Per seller order: business name (link AD-05), status, cancel reason, items (with cancelled quantities), subtotal, commission rate/amount, seller net, timeline, **status history** (from → to, actor, reason, time), its shipment (link AD-13), and "Ledger entries" → AD-22 prefilled (`referenceType=seller_order`).
5. Order status history.
6. Payment summary (amount, collected, refunded, status) with a link to AD-17; refunds of this order.
No actions (no admin cancellation in R1 [SPEC 09 S-9]); the page states: "To cancel, ask the seller or the customer." [PROPOSED wording].

### AD-16 Refund queue
Data: `GET /admin/payments/refunds` — tabs To record (`status[eq]=pending_manual`, oldest first: the backend default) / Recorded (`status[eq]=recorded`, `-createdAt`); reason filter (`reason[in]`); date range.
Row: created, order (link AD-15), seller order id, amount, reason label, status, provider reference, recorded at.
Action **Record refund** (`pending_manual`): dialog "Refund {amount} in the Kashier dashboard first, then enter Kashier's refund reference here." Field provider refund reference 1..100 → `POST /admin/payments/refunds/{refundId}/record { providerRefundRef }` with `Idempotency-Key` → `200 RefundDto` → update row. `REFUND_ALREADY_RECORDED` → refetch; `REFUND_NOT_FOUND` → refetch.
Acceptance: a retried record never records twice (same key); the instruction to refund in Kashier first is always shown.

### AD-17 Payment
Data: `GET /admin/payments/{paymentId}`.
Content: method, status, amount, collected, refunded, provider order and transaction references, paid at; refunds (as AD-16 rows, with Record action); events (type, signature valid, processed at, received at; no payloads [SPEC 10]).

### AD-18 Finance accounts
Data: `GET /admin/finance/accounts` — type tabs: Sellers (`seller_payable`), Agent fees (`agent_fee_payable`), Agent COD cash (`agent_cod_cash`), Platform (`platform_commission_revenue,platform_delivery_revenue`), All; "Only non-zero balances" (`balance[gt]=0`); owner filter (`ownerId[eq]`); sort balance desc (default) / last updated.
Row: account type label, owner name (or "Nile" for platform accounts), balance (negative shown in red with a minus [SPEC 12 FI-1]), last updated. Row actions: Statement (AD-19); for `seller_payable` / `agent_fee_payable` "Record payout" (AD-21 prefilled); for `agent_cod_cash` "Record cash received" (AD-20 prefilled).
Help text per type [SPEC 12 §1.1]: Sellers "Nile owes the seller"; Agent fees "Nile owes the agent"; Agent COD cash "Cash the agent holds for Nile"; Platform delivery revenue "May be negative" with the reason.

### AD-19 Account statement
Data: `GET /admin/finance/accounts/{accountId}` + `/entries` (entry type filter `entryType[in]`, date range, `-createdAt`).
Row: date, entry type label, credit/debit amount, balance after, reference (link: `seller_order` → AD-22 lookup; `order` → AD-15; `cod_remittance` → AD-20; `payout` → AD-21).

### AD-20 COD remittances
Data: `GET /admin/finance/cod-remittances` (agent filter, date range).
Row: date, agent name, amount, note, confirmed by (actor rule §2.2).
Action **Record cash received** [VERIFIED `CreateRemittanceDto`]: agent (picker of agents; shows their current COD cash from accounts), amount (> 0, ≤ the shown COD cash, warning only: the backend enforces it), note (optional 1..500). Confirm "Record {amount} received from {agent}? Their COD cash goes down by this amount." → `POST /admin/finance/cod-remittances` with `Idempotency-Key` → `201`. Errors: `AGENT_NOT_FOUND`, `REMITTANCE_EXCEEDS_BALANCE` → refetch balance, "The agent holds only {balance}."

### AD-21 Payouts
Data: `GET /admin/finance/payouts` (payee type tabs Sellers / Agents / All; payee filter; date range).
Row: paid at, payee (type + name), amount, external reference, recorded by, recorded at.
Action **Record payout** [VERIFIED `CreatePayoutDto`]: payee type (seller / agent); payee (search sellers by business name or agents by name); shows the payee's current balance owed (`seller_payable` / `agent_fee_payable`); amount (> 0, warning above the balance); external reference (bank transfer id etc.) 1..200; paid at (date and time in Cairo time, default now, not in the future [SPEC 12 FI-9]; sent as ISO with offset). Confirm summary → `POST /admin/finance/payouts` with `Idempotency-Key` → `201`.
Errors: `PAYEE_NOT_FOUND`, `PAYOUT_EXCEEDS_BALANCE` (refetch balance), `PAID_AT_IN_FUTURE`, `PAYOUT_ALREADY_RECORDED` ("A payout with this reference is already recorded for this payee.").

### AD-22 Reference lookup
Form: reference type (seller order / order / COD remittance / payout) + id (UUID) → `GET /admin/finance/entries?referenceType=…&referenceId=…` (both required, unpaginated, ≤ 6 entries [SPEC 12]). Result: account (link AD-19), type, direction, amount, balance after, date. Empty: "No ledger entries for this reference yet." (entries are booked asynchronously after delivery [SPEC 12]).

### AD-23 Security
As storefront SF-19 within the admin app.

---

## 4. Copy

### 4.1 Refund reasons [SPEC 10]

| Value | Label |
|---|---|
| `seller_order_cancelled` | Seller order cancelled |
| `items_cancelled` | Items cancelled |
| `delivery_failed` | Delivery failed (returned) |
| `late_payment_after_expiry` | Paid after the payment window |
| `all_cancelled_fee` | Delivery fee (nothing delivered) |
| `amount_mismatch` | Paid amount didn't match |

### 4.2 Account and entry types [SPEC 12]

| Value | Label |
|---|---|
| `seller_payable` | Seller balance |
| `agent_fee_payable` | Agent fee balance |
| `agent_cod_cash` | Agent COD cash |
| `platform_commission_revenue` | Commission revenue |
| `platform_delivery_revenue` | Delivery revenue |
| `seller_net_earned` | Seller earnings |
| `commission_earned` | Commission |
| `agent_fee_earned` | Agent fee share |
| `platform_fee_earned` | Delivery fee kept |
| `cod_cash_collected` | COD cash collected |
| `cod_cash_remitted` | COD cash handed in |
| `seller_payout` | Seller payout |
| `agent_payout` | Agent payout |

### 4.3 Shipment status, attempt reasons, actor roles

| Value | Label |
|---|---|
| `unassigned` | Unassigned |
| `assigned` | Assigned |
| `picked_up` | Picked up |
| `out_for_delivery` | Out for delivery |
| `delivery_failed` | Attempt failed |
| `returning_to_seller` | Returning to seller |
| `returned_to_seller` | Returned to seller |
| `delivered` | Delivered |
| `cancelled` | Cancelled |
| `customer_unreachable` | Customer unreachable |
| `customer_refused` | Customer refused |
| `wrong_address` | Wrong address |
| `customer_rescheduled` | Customer rescheduled |
| actor `customer` / `seller` / `admin` / `delivery_agent` / `system` | Customer / Seller / Admin / Agent / System |

Order, seller-order, payment, seller and product statuses: as specs 01 §7 and 02 §5, in the admin's neutral wording (seller-order `placed` = "Placed (awaiting seller)").

## 5. Non-functional

- Polling: dashboard 60 s while visible; nothing else polls (admins refresh on focus).
- Every money action: idempotency key, summary confirmation, no automatic retry except with the same key.
- Desktop-first layout (AD-Q-8); tables stack below 768 px.
- All pages `noindex`, `no-store`.

## 6. Questions (all answered 2026-10-14: the recommendation was accepted for each)

| # | Question | Options (recommendation first = decision) |
|---|---|---|
| AD-Q-1 | Dashboard content | **Five work queues: pending sellers, unassigned shipments, refunds to record, agents holding COD cash, orders awaiting card payment (Rec)** · no dashboard, start on Orders |
| AD-Q-2 | Showing who did something in histories (API gives only user ids) | **Role label + "you" + admin email when the id is an admin (Rec)** · role and short id only · ask the backend for actor names |
| AD-Q-3 | Agent/seller names on remittance, payout and shipment lists (API gives ids) | **Fetch each unique id on the visible page once, cached 5 min (Rec; ≤ 20 small requests per page)** · show ids only · ask the backend to add names to these DTOs |
| AD-Q-4 | Customer suspension and agent invite resend aren't possible (no `userId` exposed) | **Leave out, with an explanatory note (Rec; OQ-7 accepted)** · ask the backend to expose `userId` |
| AD-Q-5 | Confirmation for money actions | **Summary dialog with the amount and payee (Rec)** · type the amount again to confirm |
| AD-Q-6 | Rate inputs | **Percent with up to 2 decimals, converted to the API's fraction (Rec)** · raw fraction input |
| AD-Q-7 | Payout `paidAt` input | **Date and time in Cairo time, default now (Rec)** · date only (midnight) |
| AD-Q-8 | Device support | **Desktop-first, usable on tablets and phones (Rec)** · desktop only |
| AD-Q-9 | Category editor | **Tree on the left, details panel on the right (Rec)** · separate pages per category |
