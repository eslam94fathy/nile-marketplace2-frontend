# Screen-reader spot checks (T-I2)

Status: **to be performed by a person** (NVDA and VoiceOver can't run in this environment). Automated checks
already cover the structure: axe runs on the final state of every component test (Vitest, structural WCAG 2.2
AA rules) and on the visited pages of every E2E spec (Playwright, including colour contrast); keyboard-only
E2E specs walk each role's main workflows (`e2e/<app>/keyboard.spec.ts`). These spot checks cover what tools
can't judge: whether what is *announced* makes sense.

## Set-up

| Pair | Where | Basics |
|---|---|---|
| NVDA 2024+ with Firefox or Chrome | Windows | `Insert+Space` browse/focus mode; `H` next heading, `D` next landmark, `F` next form field, `Tab` next control; `Insert+F7` elements list |
| VoiceOver with Safari | macOS | `Cmd+F5` on/off; `VO` = `Ctrl+Option`; `VO+U` rotor (headings, landmarks, form controls); `VO+→` next item |
| VoiceOver with Safari | iOS (agent app) | Settings › Accessibility › VoiceOver; swipe right/left to move, double-tap to activate, rotor with two fingers |

Run against a local production build (`npm run build`, then `npm run start -w @nile/<app>`) with the backend
and seed data (CLAUDE.md §13). Use one account per role.

## What to listen for on every screen

1. The page title is announced on arrival, and focus lands at the top (the skip link is the first stop).
2. Landmarks: banner, navigation (each one named, e.g. "Delivery app" in the agent app), main, contentinfo where present.
3. Exactly one level-1 heading, naming the screen; sections reachable by heading navigation.
4. Every control says what it is and what it does ("Set fee for Cairo, button"), never just "button".
5. Status badges are read as text ("Status: Awaiting payment"), not as colour.
6. Money is read in full ("E G P 1,250.00"); dates in a readable form.
7. Errors: a field error is read with its field; a form-level error is announced when it appears.
8. Toasts are announced politely and don't steal focus.
9. Dialogs and sheets: the title and description are read on opening; focus stays inside; Escape closes; focus
   returns to the control that opened them.
10. Loading: a list that loads more announces "More items loaded."

## Screens to check

Tick each cell with ✓ (fine), ✗ (problem: add a note below) or – (not checked).

### Storefront (customer)

| Screen | NVDA | VoiceOver | Notes |
|---|---|---|---|
| Home, category menu (desktop dropdown, phone drawer) | | | |
| Search and category listing: filters, chips, sort, "Load more" | | | |
| Product: option radios (unavailable combinations announced), quantity stepper, Add to cart | | | |
| Sign in, register, verify email (OTP field), reset password | | | |
| Cart: quantity changes, line issues, totals | | | |
| Checkout: address and payment radio groups, Place order, errors | | | |
| Order confirmation and payment return ("Confirming your payment…" live region) | | | |
| My orders tabs; order detail with countdown, Pay now, Cancel dialog | | | |
| Profile, addresses (form, default, delete dialog), security | | | |

### Seller portal

| Screen | NVDA | VoiceOver | Notes |
|---|---|---|---|
| Status banner on every page | | | |
| Overview checklist and queues | | | |
| Products list filters; product editor; Add variant dialog (Selects) | | | |
| Stock dialog ("set count to" effect sentence) and history | | | |
| Orders tabs with timers; order actions and dialogs | | | |
| Finance balance, statement, payouts | | | |
| Profile form | | | |

### Admin console

| Screen | NVDA | VoiceOver | Notes |
|---|---|---|---|
| Dashboard queues | | | |
| Admins: tabs, invite, suspend dialogs | | | |
| Sellers list filters; seller page actions and histories | | | |
| Categories tree (expand/collapse state, current item) and panel | | | |
| Delivery settings: fee dialog, stop delivering | | | |
| Agents list, new agent, agent page actions | | | |
| Shipments list; shipment page; assign dialog | | | |
| Orders, order page; refunds queue (reason checkboxes); record refund dialog | | | |
| Finance accounts, statement, remittance and payout dialogs (two steps, payee search results) | | | |
| Reference lookup | | | |

### Agent app (also on a phone)

| Screen | NVDA | VoiceOver (iOS) | Notes |
|---|---|---|---|
| Shift switch ("On shift"/"Off shift" state) and the off-shift confirmation | | | |
| Shipment tabs and cards (each card one link with the amount to collect) | | | |
| Shipment: call and maps links, payment card, action bar | | | |
| Delivered sheet (amount, tick box), failed-attempt sheet (radios, consequence) | | | |
| History, finance tabs, Me | | | |

### Release 2 (T-O2)

Live regions announce politely and never move focus; check that each is heard once, in words, at the right moment.

| Screen / widget | NVDA | VoiceOver | Notes |
|---|---|---|---|
| Notification bell: name with the unread count ("Notifications, 3 unread"), panel opens with focus inside, Escape returns to the bell, unread items say "Unread" | | | |
| Photo uploader (review, return, ticket, seller product, category image): the file input announced as "Add photos" / "Add images" with its limit hint ("JPEG, PNG or WebP, up to 5 MB each, at least 200 × 200 px."); "Checking…", progress "Upload of {file}" at "Uploading {n} %", "Processing…", "Ready"; a failure "Photo {n} of {total} failed. {reason}" read once | | | |
| Star rating input (write / edit a review): one radio group "Rating", arrows move between "1 star" … "5 stars", the choice read back; the "Choose a rating." error read with the group | | | |
| Product and review photo lightbox: dialog title, "Photo {n} of {total}" on every arrow press, "Previous photo" / "Next photo" buttons, focus back on the thumbnail after Escape | | | |
| Support thread (storefront, seller, admin): "New message." / "{n} new messages." when messages arrive, "Nile Support is typing…" (storefront, seller) or the user typing (admin) without repeats, "Your message wasn't sent." with Retry, "Reconnecting…" | | | |
| Admin ticket: Reply / Internal note tabs (selected state), "Internal note · {sender}" on notes, "Replying assigns this ticket to you." | | | |
| Seller product images: "Actions for image {n} of {total}" menu, "Image moved to position {n} of {total}." after a move, "Main image" on the first | | | |
| Checkout payment return: "Confirming your payment…" then the result, read once whether the socket or polling brings it | | | |
| Agent Shipments: "New pickup assigned." / "A shipment was reassigned." (screen-reader only), return pickup badge "Return pickup", "Pickup attempt {n} of 3" | | | |
| Admin dashboard "Today": "Figures from {date time}", "Refresh the figures"; the sales table caption, bars hidden from readers | | | |
| Returns (storefront SF-26…28, seller SE-18/19, admin AD-32/33): deadlines read as dates, the next-step sentence, the decision dialogs' two steps | | | |

## Findings

| # | App / screen | Reader | What was heard | Expected | Fixed in |
|---|---|---|---|---|---|
| | | | | | |
