# Spec 04 — Delivery agent app

Status: **v1.0 APPROVED (2026-10-14); v1.1 APPROVED (2026-10-23): §7 Release 2, every recommendation and [PROPOSED] item accepted (T-J0).** Approved by the user with every recommendation in §6 (AG-Q-1…AG-Q-6) and every [PROPOSED] item. Changes from now on need explicit approval and a version bump.
Conventions: `00-conventions.md` v1.0. Backend specs cited as [SPEC nn] = `../nile-marketplace2/docs/spec/<nn>-*.md`; [VERIFIED] = running API / OpenAPI / backend code.
App: `apps/agent`, dev port 4103. Access roles: public (sign-in, password reset), `delivery_agent`. Screen ids `AG-nn`.

---

## 1. Scope

**In scope:** sign-in and password reset (accounts are created by an admin; the invite is accepted on the storefront `/invite` landing, spec 01 SF-20); profile and status; going on/off shift; active shipments; working a shipment (picked up → out for delivery → delivered / failed attempt → returned); delivery history; finance (fee balance, COD cash held, statements, hand-in history); password change.

**Out of scope (and why):**

| Item | Reason |
|---|---|
| Rejecting or swapping an assignment | Agents can't reject; only admins reassign [SPEC 00 Q-41] |
| Seeing unassigned shipments or other agents' work | Agents see only their own shipments [SPEC 11] |
| Recording a COD cash hand-in | Admins confirm hand-ins [SPEC 12]; the agent only sees them |
| Route planning, live location, maps inside the app | No API support; an "Open in maps" link to an external maps app is offered (AG-Q-3) |
| Offline mode, push notifications, installable app | Not in R1 (AG-Q-4); polling only (OQ-10) |
| Proof of delivery (photo, signature, OTP) | No API support |
| Editing own profile | No agent endpoint; admins edit agents |

## 2. Global elements

### 2.1 Layout (mobile-first)

- Designed for a phone in one hand: minimum width 360 px, touch targets ≥ 48 px, primary action in a fixed bottom bar on shipment screens, large text for amounts and addresses.
- Bottom navigation: **Shipments** · **History** · **Finance** · **Me**.
- Top bar: shift switch (AG-03) always visible, showing "On shift" / "Off shift".
- Desktop: same layout centred in a narrow column [PROPOSED].

### 2.2 Agent status [SPEC 11 DE-5]

`GET /agent/profile` is loaded at start and on focus.

| Status | Behaviour |
|---|---|
| `active` | Everything available |
| `inactive` | Banner "Your account is inactive. Contact your admin." Every screen except Me (AG-02) shows that message instead of content: all other agent endpoints answer `403 AGENT_INACTIVE` |

In practice a deactivated agent's login is also suspended [SPEC 11 S-10], so they are signed out at their next request; the inactive screen covers the time in between and agents whose login was still `invited`.
Any `AGENT_INACTIVE` (403 or 409, OQ-12) refetches the profile and shows the banner.

### 2.3 Route map

| Route | Screen |
|---|---|
| `/login`, `/forgot-password`, `/reset-password` | AG-01 Auth |
| `/me` | AG-02 Me |
| (top bar) | AG-03 Shift switch |
| `/` | AG-04 Active shipments |
| `/shipments/[shipmentId]` | AG-05 Shipment |
| `/history` | AG-06 History |
| `/finance` | AG-07 Finance |
| `/security` | AG-08 Security |

All pages: shell + client, `no-store`, `noindex`.

---

## 3. Screens

### AG-01 Sign in and password reset
As storefront SF-10, SF-13, SF-14 with: only `role = delivery_agent` accepted (other roles: "This isn't a delivery agent account."); `deviceName` "Web (agent)"; `notice=invited` → "Your password is set. Please sign in."; email input uses the email keyboard; "Keep me signed in" isn't offered (the session lasts as long as the refresh token, 30 days [SPEC 03]).

### AG-02 Me
Data: `GET /agent/profile`, `GET /governorates` (home governorate name).
Content: full name, email, phone, home governorate, status, on shift, active shipment count. Links: Security (AG-08), Sign out. Note: "To change your details, contact your admin."

### AG-03 Shift switch
Control in the top bar. `PATCH /agent/availability { onShift }` → `200 AgentProfileDto` → update cache.
- Going **on** shift: no confirmation.
- Going **off** shift: confirm "You won't get new shipments. You still need to finish the {activeShipmentCount} you have." (count from the profile) [SPEC 11 UC-DE-2].
- Errors: `AGENT_INACTIVE` → §2.2.
Acceptance: the switch always reflects the last API response; off shift never hides current shipments.

### AG-04 Active shipments

Route: `/` · Data: `GET /agent/shipments` per tab (`limit=20`, load more), refetched every 30 s while visible (api-inventory §10.4) and on focus.
Tabs [PROPOSED]:

| Tab | `status[in]` | Sort |
|---|---|---|
| To pick up | `assigned` | `createdAt` (oldest first) |
| To deliver | `picked_up,out_for_delivery,delivery_failed` | `createdAt` |
| Returns | `returning_to_seller` | `createdAt` |

Card: order number; status label; **pickup** business name + area, city; **drop-off** area, city, governorate name; payment "Collect {amountToCollect}" (COD) or "Prepaid — collect nothing" (card); attempts "Attempt {attemptCount + 1} of 3" when `delivery_failed`; assigned time. Tap → AG-05.
States: empty tab texts: "Nothing to pick up.", "Nothing to deliver.", "No returns." Off shift and all empty: "You're off shift. Go on shift to get new shipments."
Acceptance:
1. Only the agent's own active shipments appear (the API scopes them).
2. Lists refresh at most every 30 s and only while the app is visible.

### AG-05 Shipment

Route: `/shipments/[shipmentId]` · Data: `GET /agent/shipments/{shipmentId}` (`SHIPMENT_NOT_FOUND` → "This shipment isn't assigned to you any more." + back; covers admin reassignment [SPEC 11]). Refetch on focus.

Content:
1. Header: order number, status label.
2. **Pickup** card: business name, phone (tap to call, `tel:`), full address (city, area, street, building, landmark), "Open in maps" (AG-Q-3).
3. **Drop-off** card: recipient name, phone (tap to call), full address including floor, apartment, landmark, governorate name, "Open in maps".
4. **Payment** card:
   - COD: "Collect in cash: **{amountToCollect}**" with the breakdown "Items {codItemsAmount} + delivery {codFeeAmount}" when the fee is non-zero. Before going out for delivery, the note "The amount is confirmed when you start the delivery." (the delivery fee may be added to this parcel at that moment [SPEC 11 UC-DE-3]).
   - Card: "Prepaid — collect nothing."
5. Attempts: list of failed attempts (number, reason label, note, time).
6. Times: assigned, picked up, delivered.

Actions (primary button in the bottom bar, one per status) [SPEC 11 §1.1, §4.2]:

| Status | Primary action | Secondary |
|---|---|---|
| `assigned` | A1 Picked up | – |
| `picked_up` | A2 Start delivery | – |
| `out_for_delivery` | A3 Delivered | A4 Delivery failed |
| `delivery_failed` | A2 Start next attempt | – |
| `returning_to_seller` | A5 Handed back to seller (only when applicable, see below) | – |
| `delivered`, `returned_to_seller`, `cancelled` | none (read-only) | – |

- **A1 Picked up**: confirm "Did you collect the parcel from {businessName}?" → `POST /agent/shipments/{id}/picked-up` → `200 AgentShipmentDto` → replace cache. No idempotency key (state-guarded [SPEC 11]); a `SHIPMENT_INVALID_STATUS_TRANSITION` refetches.
- **A2 Start delivery / next attempt**: `POST …/out-for-delivery` → `200` → the payment card now shows the final `amountToCollect` with a highlight "Collect {amount}" [SPEC 11 DE-8].
- **A3 Delivered**:
  - COD: sheet "Collect **{amountToCollect}** in cash" + checkbox "I collected {amountToCollect}" (required) → `POST …/delivered { codCollectedAmount: amountToCollect }` with `Idempotency-Key`. The amount is the API's value, not typed [PROPOSED, AG-Q-2]; the backend requires an exact match (`COD_AMOUNT_MISMATCH`) [SPEC 11].
  - Card: confirm "Hand the parcel to {recipientName}? Nothing to collect." → `POST …/delivered` with an empty body and `Idempotency-Key` (`COD_AMOUNT_NOT_ALLOWED` if an amount were sent).
  - Success → "Delivered" screen with "Back to shipments".
  - Errors: `COD_AMOUNT_MISMATCH` / `COD_AMOUNT_REQUIRED` → refetch the shipment and show the current amount ("The amount to collect changed. Please collect {amount}."); `SHIPMENT_INVALID_STATUS_TRANSITION` → refetch.
- **A4 Delivery failed**: sheet with reason (required, radio): Customer unreachable · Customer refused · Wrong address · Customer rescheduled; note (optional 1..500). Before submitting, the sheet states the consequence [SPEC 00 §4.7]:
  - reason `customer_refused` → "The parcel goes back to the seller. No more attempts."
  - this is attempt 3 (`attemptCount + 1 = 3`) → "This was the last attempt. The parcel goes back to the seller."
  - otherwise → "You can try again later (attempt {n} of 3)."
  → `POST …/failed-attempt { reason, note? }` with `Idempotency-Key` → `200` → status `delivery_failed` or `returning_to_seller`.
- **A5 Handed back to seller**: only for a parcel whose seller order was **cancelled after pickup**; normal returns (refused or 3 failed attempts) are closed by the seller confirming receipt in their app [SPEC 11 DE-6]. The agent DTO doesn't say which case applies [VERIFIED: `AgentShipmentDto` has no `sellerOrderCancelledAt`, while the backend guard requires it, `shipment-work.service.ts`]. Rule [PROPOSED, AG-Q-1]:
  - Show A5 when the status is `returning_to_seller` **and** the shipment did **not** end its attempts normally, i.e. no attempt has reason `customer_refused` and `attemptCount < 3` [ASSUMPTION: a normal return always has a refused attempt or 3 attempts; proved by E2E].
  - Otherwise show the note "Return the parcel to {businessName}. The seller confirms it in their app."
  - Confirm "Did you hand the parcel back to {businessName}?" → `POST …/returned` with `Idempotency-Key`. `SHIPMENT_INVALID_STATUS_TRANSITION` → refetch + the note above.
- Every response replaces the shipment cache and invalidates the AG-04 lists.
Acceptance:
1. Exactly one primary action per status, as in the table.
2. COD delivery always sends the API's current `amountToCollect`; card delivery sends no amount.
3. The failed-attempt sheet states whether the parcel goes back to the seller before submitting.
4. A retried delivered / failed-attempt / returned request never applies twice (same key).

### AG-06 History

Route: `/history` · Data: `GET /agent/shipments?status[in]=delivered,returned_to_seller,cancelled&sort=-createdAt` (load more); optional date range (`createdAt[gte|lte]`).
Row: order number, final status, drop-off area, amount collected (COD delivered: `amountToCollect` at delivery as returned) or "Prepaid", delivered time. Tap → AG-05 read-only.
Note: a shipment cancelled before pickup was never the agent's to deliver; it appears here as "Cancelled" [PROPOSED wording: "Cancelled before pickup"].

### AG-07 Finance

Route: `/finance?tab=fees|cash|handins` · Data: `GET /agent/finance/balances`; statements `GET /agent/finance/entries?account=fee|cod` (`-createdAt`, load more, optional date range); hand-ins `GET /agent/finance/remittances`.
Content:
1. Two balance cards [SPEC 12]:
   - "Nile owes you" = `feePayable` — "Your share of delivery fees for delivered parcels. Paid by Nile outside the app."
   - "Cash to hand in" = `codCashHeld` — "Cash you collected on delivery that you still need to hand in."
2. Tab **Fees** (`account=fee`): date, description (`agent_fee_earned` "Fee for delivery" · `agent_payout` "Payout"), amount ±, balance after.
3. Tab **Cash** (`account=cod`): date, description (`cod_cash_collected` "Collected on delivery" · `cod_cash_remitted` "Handed in"), amount ±, balance after.
4. Tab **Hand-ins**: date, amount, note (confirmed by an admin).
- Statement rows link to nothing (agents have no order view beyond their shipments; the reference is a seller order id, which the agent API doesn't resolve) [PROPOSED].
- Entry types that shouldn't appear on agent accounts are shown with their raw type and logged.
States: "No transactions yet." / "No hand-ins yet."

### AG-08 Security
As storefront SF-19 within the agent app.

---

## 4. Copy

### 4.1 Shipment status (agent view) [PROPOSED wording]

| Value | Label |
|---|---|
| `assigned` | To pick up |
| `picked_up` | Picked up |
| `out_for_delivery` | On the way |
| `delivery_failed` | Attempt failed |
| `returning_to_seller` | Return to seller |
| `returned_to_seller` | Returned |
| `delivered` | Delivered |
| `cancelled` | Cancelled before pickup |
| `unassigned` | (never shown to agents) |

### 4.2 Failed attempt reasons

| Value | Label |
|---|---|
| `customer_unreachable` | Customer unreachable |
| `customer_refused` | Customer refused the parcel |
| `wrong_address` | Wrong address |
| `customer_rescheduled` | Customer asked for another time |

## 5. Non-functional

- Mobile performance budget: interactive in < 3 s on a mid-range phone over 4G for AG-04 and AG-05.
- Polling: AG-04 every 30 s while visible; nothing else polls.
- Phone numbers and addresses are shown only on screen; never logged, never cached beyond the query cache (cleared on sign-out).
- All pages `noindex`, `no-store`.

## 6. Questions (all answered 2026-10-14: the recommendation was accepted for each)

| # | Question | Options (recommendation first = decision) |
|---|---|---|
| AG-Q-1 | The agent API doesn't say whether a returning parcel was cancelled after pickup (agent confirms) or returned normally (seller confirms) | **Infer it from the attempts (no refused attempt and fewer than 3 attempts → agent confirms) and handle a refusal gracefully; ask the backend to add `sellerOrderCancelledAt` to the agent DTO later (Rec)** · always show the button and rely on the backend error · ask the backend first |
| AG-Q-2 | COD delivery confirmation | **Show the API's amount, the agent ticks "I collected {amount}" (Rec: no typing errors, the backend needs an exact match)** · the agent types the amount and it must match |
| AG-Q-3 | "Open in maps" link (sends the address text to an external maps service when tapped) | **Include, opened only by the agent's tap (Rec)** · leave out |
| AG-Q-4 | Installable app / offline support | **Not in R1 (Rec)** · installable web app (no offline actions) |
| AG-Q-5 | Tabs on the active list | **To pick up / To deliver / Returns (Rec)** · one list sorted by status |
| AG-Q-6 | Desktop use | **Same mobile layout centred (Rec)** · phone only |

---

## 7. Release 2 [v1.1 APPROVED 2026-10-23, T-J0]

Backend inputs at `ecbcd19`: specs 11 §8, 13 §8 (NO-10), 15. Conventions: `00-conventions.md` §12. Plan: `release-2-plan.md` (phase n). Workflows: `workflows.md` §6.4.

### 7.1 Scope changes
- **Now in scope:** return pickups (reverse shipments from the customer to the seller); live updates of the shipment lists; Web Push for new assignments (`high` urgency [SPEC 13 NO-10]); the notification centre; a web app manifest so the app can be added to the Home Screen (FR2-Q2: needed for push on iPhone).
- **§1 row changed:** "Offline mode, push notifications, installable app" → offline mode is still out of scope (AG-Q-4 unchanged); push and Home Screen install are in.
- **Still out of scope:** rejecting assignments, live location, proof of delivery or of pickup.

### 7.2 Route map and navigation additions
Bottom navigation unchanged (Shipments · History · Finance · Me); the bell sits in the top bar next to the shift switch.

| Route | Screen |
|---|---|
| `/notifications` | AG-09 Notifications |
| `/notifications/settings` | AG-10 Notification settings (linked from Me) |

### 7.3 Changes to existing screens

**AG-04 Active shipments:**
- Tabs (AG-Q-7):

| Tab | Query | Sort |
|---|---|---|
| To pick up | `status[in]=assigned,pickup_failed` (both kinds) | `createdAt` |
| To deliver | `kind[eq]=delivery`, `status[in]=picked_up,out_for_delivery,delivery_failed` | `createdAt` |
| To the seller | `status[in]=returning_to_seller` (failed deliveries) and `kind[eq]=return`, `status[eq]=picked_up` (customer returns) — two requests merged by `createdAt` [PROPOSED] | `createdAt` |

- A return shipment's card is marked **"Return pickup"** (text badge) and shows: collect from the customer (area, city, governorate), deliver to the seller (business name, area, city), "Nothing to collect", and "Pickup attempt {n + 1} of 3" when `pickup_failed`.
- Live: `shipment.assigned` (new card + polite announcement "New pickup assigned."), `shipment.unassigned` (card removed, "A shipment was reassigned."), `shipment.updated` refresh the tabs; the 30 s polling stays only without a socket.

**AG-05 Shipment, `kind = return`** [SPEC 11 §8, DE-26]:
1. Header: "Return pickup", order number, status.
2. **Collect from (customer)** card: the `dropoff` party — recipient, phone (tap to call), full address, "Open in maps".
3. **Deliver to (seller)** card: the `pickup` party — business name, phone, address, "Open in maps".
4. Payment card: "Nothing to collect." (never an amount).
5. Attempts: pickup attempts with reasons.
6. Actions:

| Status | Primary | Secondary |
|---|---|---|
| `assigned`, `pickup_failed` | R1 Collected from the customer | R2 Pickup failed |
| `picked_up` | R3 Handed to the seller | – |
| `delivered`, `cancelled` | none | – |

- **R1** confirm "Did you collect the items from {recipientName}?" → `POST /agent/shipments/{id}/picked-up` → `200`.
- **R2** sheet with the reason (Customer unreachable · Customer refused · Wrong address · Customer rescheduled) and an optional note (1..500); consequences stated before submit: `customer_refused` → "The return is closed. No more attempts."; third attempt → "This was the last attempt. The return is closed." → `POST …/failed-attempt { reason, note? }` with Idempotency-Key (as A4).
- **R3** confirm "Hand the items to {businessName}? Nothing to collect." → `POST …/delivered` with an empty body and Idempotency-Key.
- Errors as R1 delivery actions (`SHIPMENT_INVALID_STATUS_TRANSITION` → refetch; `SHIPMENT_NOT_FOUND` → "This shipment isn't assigned to you any more.").

**AG-06 History:** + kind filter chips (All · Deliveries · Return pickups) → `kind[eq]`; return rows marked "Return pickup".

**AG-07 Finance:** no change (the agent's fee share of a return is booked when the return completes [SPEC 12 §8.4]; it appears in the fee statement as "Delivery fee share" (R1 label)).

**AG-02 Me:** + "Notifications" (AG-10) and, on iPhone / iPad outside the installed app, the hint "Add to Home Screen to get notifications." (conventions §12.6).

### AG-09 / AG-10 Notifications
As conventions §12.4–§12.6 with the agent link map. On the agent app the push card is shown on the Shipments screen until dismissed or accepted: "Get notified when a new shipment is assigned to you." (AG-Q-8).

### 7.4 Acceptance across Release 2 (agent)
1. A return shipment never offers delivery actions and never shows an amount to collect.
2. The address shown as "Collect from" is the customer for returns and the seller for deliveries.
3. A new assignment appears without reload when a socket is connected, and within 30 s otherwise.

### 7.5 Copy
**Shipment kind:** Delivery · Return pickup. **Status** (+): `pickup_failed` Pickup failed — try again. Return shipment `picked_up` reads "Collected — take to the seller"; `delivered` reads "Handed to the seller".
**Notification category:** Orders · Deliveries · Support · Offers (agents only receive Deliveries in R2).

### 7.6 Questions (Release 2)

| # | Question | Options (recommendation first) |
|---|---|---|
| AG-Q-7 | Where return pickups appear | **In the same tabs as deliveries, by what the agent does next: To pick up (both kinds), To deliver (deliveries), To the seller (failed deliveries and collected returns) (Rec)** · a separate "Return pickups" tab |
| AG-Q-8 | Asking agents to turn on push | **A card on the Shipments screen until dismissed or accepted (Rec: assignments are the agent's main trigger)** · only in settings |
