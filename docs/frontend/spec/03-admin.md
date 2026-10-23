# Spec 03 — Admin console

Status: **v1.0 APPROVED (2026-10-14); v1.1 APPROVED (2026-10-23): §7 Release 2, every recommendation and [PROPOSED] item accepted (T-J0).** Approved by the user with every recommendation in §6 (AD-Q-1…AD-Q-9) and every [PROPOSED] item. Changes from now on need explicit approval and a version bump.
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

---

## 7. Release 2 [v1.1 APPROVED 2026-10-23, T-J0]

Backend inputs at `ecbcd19`: specs 06 §8, 09 §8.4, 10 §8, 11 §8, 12 §8, 13 §8, 14, 15, 16, 17, 18, 19, 20. Conventions: `00-conventions.md` §12. Plan: `release-2-plan.md` (phase m). Workflows: `workflows.md` §6.5.

### 7.1 Scope changes
- **Now in scope:** dashboard figures; user directory and customers; customer suspension and invite resend through the user directory (AD-Q-10); admin cancellation of orders and seller orders; admin product view with block / unblock; category images; support console; review moderation; returns decisions; automatic refunds (queue, detail with COD payout details, retry); platform coupons and seller-coupon blocks; audit log; notification centre and Web Push; live updates.
- **§1 rows removed or changed:** "Suspending/reactivating customers; resending an agent's invite" (the user directory exposes user ids now [VERIFIED `AdminUserListItemDto.id`]); "Customer list or search" (now `GET /admin/customers`); "Cancelling orders or seller orders" (now [SPEC 09 §8.4]); "Issuing refunds" (Kashier refunds are automatic now; the console records manual ones and retries failed ones [SPEC 10 §8]); "Revenue reports, charts, counts" (the dashboard has aggregates [SPEC 20 §3.2]; lists still have no counts).
- **Still out of scope:** an admin product list or search (no endpoint: AD-Q-11), editing seller products, prices or stock, reassigning a shipment after pickup, moving or deleting categories, reading admin views of other admins' reads (reads aren't audited [SPEC 20 BO-3]).

### 7.2 Navigation and route map additions
Sidebar groups:
- **Dashboard**
- **Marketplace:** Sellers · Orders · **Returns** · Refunds · **Coupons** · **Reviews**
- **People:** **Users** · **Customers**
- **Support:** **Tickets**
- **Catalog:** Categories
- **Delivery:** Shipments · Agents · Delivery settings
- **Finance:** Accounts · COD remittances · Payouts · Reference lookup
- **Settings:** Commission · Admins · **Audit log**
Header: + bell (conventions §12.4).

| Route | Screen |
|---|---|
| `/users` | AD-24 Users |
| `/customers`, `/customers/[customerId]` | AD-25 Customers, AD-26 Customer |
| `/products/[productId]` | AD-27 Product |
| `/support`, `/support/[ticketId]` | AD-28 Tickets, AD-29 Ticket |
| `/reviews`, `/reviews/[reviewId]` | AD-30 Reviews, AD-31 Review |
| `/returns`, `/returns/[returnId]` | AD-32 Returns, AD-33 Return |
| `/refunds/[refundId]` | AD-34 Refund |
| `/coupons`, `/coupons/new`, `/coupons/[couponId]` | AD-35 Coupons, AD-36 New coupon, AD-37 Coupon |
| `/audit`, `/audit/[entryId]` | AD-38 Audit log, AD-39 Audit entry |
| `/notifications`, `/notifications/settings` | AD-40 Notifications, AD-41 Notification settings |

### 7.3 Changes to existing screens

**AD-02 Dashboard:**
- New top section "Today" from `GET /admin/dashboard` (stale 60 s; "Figures from {generatedAt}" + "Refresh"; no polling, AD-Q-16):
  - Orders: seller orders by open status (a labelled list, each linking to AD-14 with the matching filter), placed today, placed in the last 7 days.
  - Sales (last 30 Cairo days): a table "Day · Placed · Delivered" with inline SVG bars per row (FR2-Q6), most recent first; the table is the accessible source.
  - Top sellers by delivered sales (link AD-05).
  - Sellers waiting for approval, support (open, waiting for support, past the 24 h target), delivery (awaiting assignment, out for delivery, returns in progress), returns by open status, finance (COD outstanding, owed to sellers, sellers' pending earnings, owed to agents, owed to customers).
- The five R1 queue cards stay below; the refund card reads `status[eq]=pending_manual` ("Refunds needing action").
- New queue cards: "Tickets waiting longest" (`GET /admin/support/tickets?status[in]=open,awaiting_admin&sort=awaitingAdminSince&limit=5`) and "Returns to decide" (`GET /admin/returns?status[eq]=escalated&limit=5`, plus `disputed`).
- Live: a new ticket (`support.ticket_updated` to `admins`) and an escalated / disputed return (`return.updated` to `admins`) refresh their cards.

**AD-04 / AD-05 Sellers:** + rating column / line ("4.3 (12)"); AD-05 + "Products in the store" (public `GET /products?sellerId[eq]=` list, links to AD-27, AD-Q-11), + "Coupons" (link AD-35 filtered by seller).

**AD-07 Categories:** details panel + "Image": preview, "Upload image" (conventions §12.2, purpose `category_image`) → on `ready` `PUT /admin/categories/{id}/image { mediaId, altText? }`; "Edit description" (alt text 1..200) → the same `PUT` with the current `mediaId`; "Remove image" (confirm) → `DELETE …/image`. Errors: `MEDIA_NOT_ATTACHABLE` → re-upload; `CATEGORY_NOT_FOUND` → refetch the tree.

**AD-12 / AD-13 Shipments:** + "Type" filter (Delivery / Return, `kind[eq]`) and column; return shipments show "Return {returnId short}" linking to AD-33, pickup at the customer and hand-over to the seller (AD-13 labels the two addresses by role: "Collect from (customer)" / "Deliver to (seller)"), no money block (nothing to collect), status `pickup_failed`. Assignment works the same until pickup [SPEC 11 §8.2].

**AD-14 Orders:** + "Customer" filter fed from AD-26; rows show the coupon code when used.

**AD-15 Order:**
- Totals + "Coupon {code} −{discountTotal}"; seller orders + discount and funding, returned sums; items + `image`, returned quantity; cancel reason `admin_cancelled` with the admin's reason from the status history.
- Product names link to AD-27.
- **A1 Cancel seller order** (status `placed`, `accepted`, `ready_for_pickup`): dialog "Cancel {businessName}'s part of order {orderNumber}? Stock is released, the shipment is cancelled and a card payment is refunded automatically." + reason (3..500, required; "Only admins see this reason. The customer sees 'Cancelled by Nile'.") → `POST /admin/seller-orders/{id}/cancel { reason }` with Idempotency-Key → `200` admin order detail → replace. `SELLER_ORDER_NOT_CANCELLABLE` → refetch + "This part has been picked up already, so it can't be cancelled."
- **A2 Cancel order** (any seller order still cancellable): the same dialog for the whole order → `POST /admin/orders/{id}/cancel`. `ORDER_NOT_CANCELLABLE` → refetch + "Nothing was cancelled because these parts can't be cancelled any more: {businessNames from details}. Cancel the others one by one." [SPEC 09 OR-17]
- The R1 note "To cancel, ask the seller or the customer." is removed.
- Refunds block shows every refund with status, method, reason and a link to AD-34.
- "Returns of this customer" → AD-32 filtered by `customerId` (the admin returns list has no order filter [VERIFIED backend route]).

**AD-16 Refunds:** becomes the refunds list over every status. The list filters on one status at a time (`status[eq]`), `reason[eq|in]` and `createdAt[gte|lte]`, oldest first [VERIFIED backend route]: tabs **Needs action** (`pending_manual`, default, AD-Q-14) · Scheduled (`pending_auto`) · In progress (`processing`) · Refunded automatically (`succeeded`) · Recorded (`recorded`) · All; filters reason (+ Return), date range. Method is shown per row (no method filter exists). Row: created, order, amount, reason, method, status, attempts, last error (redacted text from the API) for failed automatic ones, recorded / succeeded time; row → AD-34. The R1 record dialog moves to AD-34.

**AD-17 Payment:** status labels `partially_refunded` / `refunded`; refunds as AD-16 rows.

**AD-18…AD-22 Finance:** new account types and entry / reference types (§7.6); account tabs + "Seller pending" (`seller_pending`), "Customer refunds" (`customer_refund_payable`), "Promotions" (`platform_promotions`, always ≤ 0: "Discounts funded by Nile"). AD-22 reference lookup accepts `return`, `refund`, `seller_order_hold`.

### AD-24 Users

Route: `/users?role=&status=&email=` · Data: `GET /admin/users` (`limit=20`, `-createdAt`; `role[eq]`, `status[in]`, `email[like]` as a **prefix** [SPEC 20 §3.3], `createdAt[gte|lte]` Cairo days).
Row: email, role, status badge, email verified, last sign-in, created.
Actions (AD-Q-10): customers → "Suspend" (reason 3..500, confirmation "They are signed out everywhere and can't sign in.") / "Reactivate"; invited admins and agents → "Resend invite"; never on the signed-in admin's own row; agents' working state stays on AD-11 (activate / deactivate). Endpoints are the R1 user actions (`/admin/users/{id}/suspend`, `/reactivate`, `/resend-invite`) [VERIFIED R1]. Row → AD-26 for customers.

### AD-25 Customers / AD-26 Customer

AD-25: `GET /admin/customers` with search by name (`name[like]`, first or last name) and phone (`phone[eq]`, full E.164 typed with the phone field); row: name, email, phone, status, created → AD-26.
AD-26: `GET /admin/customers/{customerId}` (`CUSTOMER_NOT_FOUND` → not found): name, email, phone, status, addresses count, created; actions Suspend / Reactivate (AD-24); "Orders" (AD-14 filtered by `customerId`), "Returns" (AD-32 filtered by `customerId`), "Reviews" (AD-30 filtered by `customerId`), "Tickets" (no customer filter exists on tickets → not offered).

### AD-27 Product

Route: `/products/[productId]` · Data: `GET /admin/products/{productId}` (`PRODUCT_NOT_FOUND` → not found).
Content: images, name, seller (link AD-05), category, status, visible, block state and reason, variants (SKU, options, price, status, stock), published / created / updated; "View in store" when visible; "Reviews" (AD-30 filtered by product).
Actions: **Block** (not blocked): reason 3..500, confirmation "The product is hidden from the store at once and the seller can't publish it. Open orders continue." → `POST …/block` → `200` replace. **Unblock** (blocked): confirmation "The product stays unpublished until the seller publishes it again." → `POST …/unblock`. `PRODUCT_BLOCK_INVALID_STATUS` → refetch.

### AD-28 Tickets

Route: `/support?view=&status=&category=&opener=&sla=` · Data: `GET /admin/support/tickets` (`limit=20`).
Views (AD-Q-12):

| View | Query |
|---|---|
| Waiting for support (default) | `status[in]=open,awaiting_admin`, sort `awaitingAdminSince` (oldest first) |
| Mine | `assignedAdminId[eq]=<me>`, `status[in]=open,awaiting_admin,awaiting_user,resolved` |
| Unassigned | `assigned[eq]=false`, `status[in]=open,awaiting_admin` |
| Past 24 h target | `slaBreached[eq]=true` |
| Waiting for user | `status[eq]=awaiting_user` |
| Resolved / Closed | `status[eq]=resolved` / `closed` |
| All | – |

Filters: category, opener role (Customer / Seller), created date range. Row: ticket number, subject, opener (name, role, email), category, status badge, assigned admin or "Unassigned", "Waiting {relative}" from `awaitingAdminSince`, "Past 24 h" badge when `slaBreachedAt`, unread dot. Live: new and updated tickets refresh the list (`support.ticket_updated`, `support.message_created` to `admins`).

### AD-29 Ticket

Route: `/support/[ticketId]` · Data: `GET /admin/support/tickets/{id}`, messages (infinite); `POST …/read` on open; `ticket.subscribe`.
Content: header (number, subject, status, category, opener with role and email, linked order → AD-15 or seller order, assigned admin, SLA state), thread (conventions §12.7; internal notes shown and labelled), composer with two tabs **Reply** (to the user) and **Internal note** (AD-Q-13): the note tab has a distinct background and the button "Add note".
Actions: **Assign to me** / **Assign…** (active admins from `GET /admin/admins`) / **Unassign** → `POST …/assign { adminUserId | null }`; **Resolve** (open / awaiting) → `POST …/resolve`; **Close** (any but closed; confirmation "Close this ticket? The user can't reply and must open a new one.") → `POST …/close`. A public reply on an unassigned ticket assigns it to the sender (stated under the composer: "Replying assigns this ticket to you.") [SPEC 16 SU-2].
Errors: `SUPPORT_ASSIGNEE_INVALID` → refetch admins; `SUPPORT_TICKET_INVALID_STATUS_TRANSITION` → refetch; `SUPPORT_TICKET_CLOSED` on a reply → refetch (notes are still allowed on closed tickets).

### AD-30 Reviews / AD-31 Review

AD-30 Route: `/reviews?status=&rating=&product=&seller=&customer=` · Data: `GET /admin/reviews` (`-createdAt`; `status[eq]`, `rating[lte]` ("3 stars or fewer" quick filter), `productId`, `sellerId`, `customerId`, `createdAt[gte|lte]`).
Row: product (link AD-27), seller, rating, title, body excerpt, photos count, status badge, reply state ("Reply hidden" when hidden), date → AD-31.
AD-31: full review (photos, variant, reviewer display name, customer id link AD-26, order item id), reply with its state, hide reason and time.
Actions: **Hide review** (published; reason 3..500; note "The review stops counting toward the rating. The author sees it as hidden, without the reason.") → `POST …/hide`; **Show review** → `POST …/unhide`; **Hide reply** / **Show reply** likewise (`…/reply/hide`, `…/reply/unhide`). `REVIEW_INVALID_STATUS_TRANSITION` / `REVIEW_REPLY_NOT_FOUND` → refetch.

### AD-32 Returns / AD-33 Return

AD-32 Route: `/returns?tab=&reason=&seller=&customer=` · Data: `GET /admin/returns` (`-createdAt`).
Tabs: **Needs decision** (`escalated,disputed`, default) · Waiting for seller (`requested`) · In progress (`approved,picked_up,received,rejected`) · Closed (`completed,refused,cancelled,pickup_failed`) · All. Filters: reason (`reason[in]`), seller, customer. Row: return number, order number, seller, reason, status, refund amount, created, deadline.
AD-33: `GET /admin/returns/{id}`: everything of SF-28 plus customer (link AD-26), seller (AD-05), agent (AD-11), payout method (not the details: "Payout details are on the refund." → AD-34 when the refund exists [SPEC 18 §4]), return shipment (AD-13), full history (from → to, actor, reason, time).
Actions:
- **Decide** (`requested` or `escalated`): dialog Approve / Reject + note (3..500, required; "Your decision is final.") → `POST …/decide { decision, note }`.
- **Resolve dispute** (`disputed`): dialog Refund the customer / Don't refund + note (3..500) → `POST …/resolve-dispute { decision, note }` with Idempotency-Key. "Refund" restocks nothing; "the seller adjusts stock by hand" is stated [SPEC 18 UC-RE-8].
- `RETURN_INVALID_STATUS_TRANSITION` → refetch + toast.

### AD-34 Refund

Route: `/refunds/[refundId]` · Data: `GET /admin/payments/refunds/{refundId}` (`REFUND_NOT_FOUND` → not found).
Content: amount, reason, status, method, order (AD-15), return (AD-33) when reason `return`, payment (AD-17), attempts, next attempt, last error, provider reference, succeeded / recorded time; for a COD return refund: **Pay to**: "Mobile wallet {walletNumber}" or "InstaPay {instapayAddress}" (shown only on this screen, never logged or copied into notes; a "Copy" button) [SPEC 10 §8.4].
Actions:
- **Record refund** (`pending_manual`): Kashier — "Refund {amount} in the Kashier dashboard first, then enter Kashier's refund reference."; COD — "Send {amount} to the customer's {method} first, then enter the transfer reference." Field reference 1..100 → `POST …/record { providerRefundRef }` with Idempotency-Key (AD-Q-5 summary step) → `200`. `REFUND_ALREADY_RECORDED` → refetch.
- **Retry automatic refund** (`pending_manual` Kashier refund only): confirmation "Send this refund to Kashier again? Do this only after fixing the cause shown above." → `POST …/retry` → `200`. `REFUND_NOT_RETRYABLE` → refetch + "This refund can't be retried automatically. Record it by hand."

### AD-35 Coupons / AD-36 New coupon / AD-37 Coupon

AD-35 Route: `/coupons?funding=&status=&seller=&code=` · Data: `GET /admin/coupons` (`funding[eq]`, `status[eq]`, `sellerId[eq]`, `code[eq]` exact, upper-cased). Row: code, funded by (Nile / seller name), discount, scope, dates, uses, display status, blocked.
AD-36 (platform-funded): the seller form (spec 02 SE-22) with scope All products · One seller (seller picker as AD-21's payee search, AD-Q-15) · One category. `SELLER_NOT_FOUND` → seller field.
AD-37: detail, the edit form for platform coupons (locked fields after the first use as SE-23; `COUPON_SELLER_FUNDED` → refetch), and the last 50 redemptions (order link, customer link, discount, status, date). Seller coupons are read-only with **Block** (reason 3..500; "The seller can't activate it while it's blocked.") / **Unblock** → `POST …/block` / `…/unblock`. `COUPON_BLOCK_INVALID_STATUS` → refetch.

### AD-38 Audit log / AD-39 Audit entry

AD-38 Route: `/audit?actor=&action=&target=&targetId=&from=&to=` · Data: `GET /admin/audit-log` (`-createdAt`; `actorUserId[eq]` (admin picker incl. "you"), `action[in]` (grouped checkboxes by area), `targetType[eq]`, `targetId[eq]` (only with a target type; else the field is disabled), `createdAt[gte|lte]` Cairo days).
Row: time, actor (email, or "System (command line)" for `cli`), action label, target (type + short id, linked to its screen when one exists), reason excerpt → AD-39.
AD-39: all fields; **changes** as a table "Field · Before · After" (AD-Q-15); correlation id and IP with copy buttons.
Deep links: AD-05, AD-11, AD-15, AD-27, AD-29, AD-31, AD-34 show "History" → AD-38 filtered by their target.

### AD-40 / AD-41 Notifications
As conventions §12.4–§12.6 with the admin link map (support messages on assigned tickets).

### 7.4 Acceptance across Release 2 (admin)
1. Every money-affecting action (cancel, resolve dispute, record refund) uses one idempotency key per confirmed intent and shows a summary first.
2. COD payout details appear only on AD-34 and never in logs, toasts or URLs.
3. Actions appear only for the statuses that allow them; a refusal refetches.
4. No screen claims counts or totals the API doesn't give (dashboard figures are the API's aggregates).

### 7.5 Non-functional additions
- Live updates on AD-02 cards, AD-28, AD-29, AD-32; the R1 60 s dashboard polling is dropped (AD-Q-16).
- Admin reads aren't audited; the audit log shows writes only (stated on AD-38).

### 7.6 Copy

**Ticket status (admin view):** `open` New · `awaiting_admin` Waiting for support · `awaiting_user` Waiting for user · `resolved` Resolved · `closed` Closed. **Opener role:** Customer · Seller. **Message kinds:** Internal note · System.
**Review status:** Published · Hidden.
**Return status (admin view):** `requested` Waiting for seller · `rejected` Rejected by seller · `escalated` Escalated · `approved` Approved · `picked_up` Picked up · `received` Received by seller · `disputed` Disputed by seller · `completed` Completed · `refused` Refused · `cancelled` Cancelled by customer · `pickup_failed` Pickup failed. **Refusal:** Seller rejected (not escalated) · Rejected by Nile · Dispute upheld. **Fee payer:** Seller · Customer.
**Refund status:** `pending_auto` Automatic, scheduled · `processing` Automatic, in progress · `succeeded` Refunded automatically · `pending_manual` Needs action · `recorded` Recorded. **Method:** Automatic (Kashier) · Manual. **Reason** (+): Return.
**Coupon:** funding Nile / Seller · type Percent / Fixed · scope All products / One seller / One category · display status Scheduled / Active / Expired / Inactive.
**Shipment kind:** Delivery · Return. **Shipment status** (+): `pickup_failed` Pickup failed. **Pickup failure reasons:** as R1 attempt reasons.
**Cancel reason** (+): `admin_cancelled` Cancelled by an admin.
**Account types** (+): Seller pending earnings · Customer refunds owed · Promotions (Nile-funded discounts). **Entry types** (+): Seller earnings held · Seller earnings released · Seller earnings reversed (return) · Commission reversed (return) · Discount funded by Nile · Discount reversed (return) · Return fee charged · Return fee earned · Customer refund owed · Customer refund paid. **Reference types** (+): Return · Refund · Seller order hold.
**Audit actor:** Admin · System (command line). **Audit actions:** one label per `AuditAction`, grouped by area (identity, sellers, catalog, delivery, ordering, payments, finance, support, reviews, promotions), maintained in `@nile/domain` labels (T-J1).

### 7.7 Questions (Release 2)

| # | Question | Options (recommendation first) |
|---|---|---|
| AD-Q-10 | Customer suspension and invite resend, now possible from the user directory (ids exposed) | **Offer Suspend / Reactivate for customers and Resend invite for invited admins and agents on AD-24 / AD-26; agents keep activate / deactivate on AD-11 (Rec)** · keep them out |
| AD-Q-11 | No admin product list or search: how admins reach a product to block it | **From order items (AD-15), reviews (AD-30/31) and a seller's store products on AD-05 (public list), plus a "Find product" field on AD-27's parent menu accepting a product id or storefront URL (Rec)** · ask the backend for an admin product search |
| AD-Q-12 | Support queue default | **"Waiting for support", oldest waiting first (Rec)** · "Mine" |
| AD-Q-13 | Reply vs internal note | **Two composer tabs, the note visually distinct and labelled (Rec)** · a checkbox "Internal note" |
| AD-Q-14 | Refunds default tab | **"Needs action" (`pending_manual`) (Rec)** · All |
| AD-Q-15 | Seller picker for "One seller" coupons | **The AD-21 payee search pattern (search field + result list + "Choose") (Rec, no Combobox dependency)** · the searchable Combobox (still deferred) |
| AD-Q-16 | Dashboard refresh | **Load on visit and focus, "Refresh" button, live card updates; no timed polling (Rec: the figures are cached 60 s server-side and polling shares the BFF's IP, OQ-1)** · poll every 60 s |
| AD-Q-17 | Audit "changes" display | **Field / Before / After table; money and rates formatted, unknown values raw (Rec)** · raw JSON |
