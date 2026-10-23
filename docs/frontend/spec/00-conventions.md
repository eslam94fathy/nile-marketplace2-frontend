# Spec 00 — Frontend conventions (shared by all app specs)

Status: **v1.0 APPROVED (2026-10-14)**; **v1.1 APPROVED (2026-10-23): §12 Release 2 conventions, every recommendation and [PROPOSED] item accepted (T-J0)**, with its [PROPOSED] items (approved together with spec 01). Changes from now on need explicit approval and a version bump.
Inputs: `CLAUDE.md`, `docs/frontend/{api-inventory,architecture,workflows}.md`, backend spec `../nile-marketplace2/docs/spec/` (APPROVED versions as of backend `4ad89a6`).

App specs: `01-storefront.md` · `02-seller.md` (later) · `03-admin.md` (later) · `04-agent.md` (later).

---

## 1. How the app specs are written

Each app spec has:
1. **Scope** (and what is out of scope, with the reason)
2. **Global elements** (layout, header, navigation, session behaviour)
3. **Screens**, one section each, in the notation below
4. **Copy**: labels for enums and messages for error codes used by the app
5. **Acceptance criteria** per screen
6. **Open questions** (`<APP>-Q-n`) with options and a recommendation

Labels: **[SPEC n]** = rule from backend spec `n` · **[VERIFIED]** = seen in the running API/OpenAPI · **[PROPOSED]** = frontend UX choice awaiting approval · **[OPEN]** = question.
A [PROPOSED] item is a UX decision, never a business rule. Business rules always cite the backend.

### 1.1 Screen notation

```
### <APP>-<nn> Screen name
Route: /path/[param]     Access: public | customer | seller | admin | delivery_agent     Render: server | client | server shell + client
Data:   METHOD /endpoint (when; cache policy)
Content: what is shown, field by field, in order
Actions: name — condition → call → on success → errors (code → behaviour)
States: loading · empty · error · not authorised
Acceptance: numbered, testable criteria
```

Screen ids: storefront `SF-nn`, seller `SE-nn`, admin `AD-nn`, agent `AG-nn`.

## 2. Access and session behaviour (all apps)

| Situation | Behaviour |
|---|---|
| Protected route, no session | Redirect to the app's `/login?returnTo=<current path + query>` |
| Session present, wrong role | Cannot happen inside one app (login rejects other roles, `architecture.md` §4); if it does, end the session and show the login page |
| Access token expired during a request | Silent refresh (serialised) and one retry; the user notices nothing |
| Refresh fails (`INVALID_REFRESH_TOKEN`) | Session ended: clear cache, toast "Your session has ended. Please sign in again.", redirect to login with `returnTo` |
| `ACCOUNT_SUSPENDED` at login, or `UNAUTHENTICATED` after a suspension | Login page shows "This account is suspended." No retry |
| Logout | `POST /api/auth/logout`, cache cleared, all tabs of the app go to the public home (or login for portal apps) |
| `returnTo` | Only same-origin relative paths; anything else is ignored and the role home is used |

## 3. Standard states

| State | Rule |
|---|---|
| Loading | Skeletons in the shape of the content for first loads; inline spinners for actions; never a blank page. Server-rendered pages stream with `loading.tsx` |
| Empty | A sentence that says what is empty and the next useful action (e.g. "Your cart is empty. Browse categories") |
| Error (query) | Inline error block with "Try again" (refetch) and the reference (`correlationId`) in small text |
| Error (mutation) | Toast or form-level alert with the mapped message and the reference; the form keeps its input |
| Not found | The app's not-found page (`404` from the API on an id/slug in the route) |
| Not authorised | Covered by §2; business-status blocks (seller not approved, agent inactive) are app-specific |

## 4. Default error-code handling

Applies unless a screen overrides it.

| Code | Default behaviour | Message (copy) |
|---|---|---|
| `VALIDATION_FAILED` | Map `details[].field` to fields; others → form alert | Field: the backend message is not shown; the field's own rule text is. Form: "Some fields need attention." |
| `UNAUTHENTICATED` | §2 refresh flow | – |
| `FORBIDDEN` | Error block | "You don't have access to this." |
| `*_NOT_FOUND` on the route resource | Not-found page | – |
| `*_NOT_FOUND` on a sub-resource after an action | Refetch the parent, toast | "This item no longer exists." |
| `*_INVALID_STATUS_TRANSITION`, `*_NOT_CANCELLABLE` | Refetch the resource, toast | "This was already updated. We've refreshed the page." |
| `CONFLICT` | Refetch, toast | "This was changed by someone else. Please try again." |
| `IDEMPOTENCY_REQUEST_IN_PROGRESS` | Wait 1 s, retry with the same key (max 3), then error toast | "Still working on your previous request…" |
| `RATE_LIMITED` | Disable the action for `Retry-After` seconds with a countdown | "Too many attempts. Try again in {n} s." |
| `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, `NETWORK_ERROR` | Error block / toast with retry | "Something went wrong. Please try again." + reference |
| `INVALID_QUERY`, `INVALID_CURSOR` | Reset list parameters to defaults, notice | "Some filters were not valid and have been reset." |
| Anything unmapped | As `INTERNAL_ERROR`, logged with the code | – |

## 5. Forms

- Field rules mirror backend DTO rules exactly (lengths, patterns, required/optional/nullable); the table in each screen spec lists them.
- Validation runs on blur and on submit; messages appear under the field and are announced (`aria-describedby`, `aria-invalid`).
- Submit buttons show progress and are disabled while submitting; double submission is impossible.
- Optional nullable text fields: an empty input is sent as `null` on edit (to clear) and omitted on create, unless the screen says otherwise.
- Passwords: show/hide toggle; never trimmed; 8 characters minimum, 72 UTF-8 bytes maximum (message: "Password is too long").
- Phone fields [PROPOSED]: a fixed `+20` prefix and a 10-digit input that must start with `10`, `11`, `12` or `15`; a leading `0` typed by the user is dropped (`01012345678` → `+201012345678`). The value sent is E.164.
- Email fields are trimmed and lower-cased before sending (the backend does the same).
- Leaving a form with unsaved changes asks for confirmation [PROPOSED].

## 6. Idempotent actions (UX)

- The key is created when the user confirms the action and kept, with the request body, until the action succeeds or the user changes the input.
- Retrying after a network error or `5xx` reuses the key; a replayed success is shown exactly like a first success.
- A changed body (e.g. a new `expectedTotal`) gets a new key.

## 7. Lists

- "Load more" button below the list (no infinite scroll) [PROPOSED], page size = backend default (20).
- No counts, no page numbers (the API has none).
- Filters and sort live in the URL; Back/Forward restore them.
- Status filters are tabs or chips mapped to `status[in]`.

## 8. Formatting

- Money: `EGP 1,250.00` style via `Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' })` [PROPOSED rendering; exact symbol follows the Intl output].
- Price ranges: `EGP 51.00 – EGP 71.00`; a single value when min = max.
- Dates: `14 Oct 2026, 10:30` in `Africa/Cairo`; relative times ("2 h ago") only where a spec says so.
- Countdowns: `mm:ss` under 1 h, otherwise `h h mm min`; computed from server timestamps; when they reach zero the screen refetches.

## 9. Confirmation dialogs

Required for destructive or irreversible actions: delete, cancel, empty cart, place order (the review step itself counts as confirmation), log out is **not** confirmed. Dialog text states the consequence in one sentence.

## 10. Accessibility and responsiveness

- Breakpoints: 360 px (minimum supported), 768 px, 1280 px.
- Every interactive element is reachable and operable by keyboard; focus moves to dialogs and back; toasts are announced politely; route changes move focus to the main heading.
- Colour is never the only carrier of meaning (status badges have text).

## 11. Copy and tone

- Plain, short, second person ("Your order", "You can cancel…"). No exclamation marks in errors. Sentence case.
- Enum labels and error messages live in central maps; specs list them per app.
- The product name shown in UI copy is "Nile" [PROPOSED].

---

## 12. Release 2 conventions [v1.1 APPROVED 2026-10-23, T-J0]

Backend inputs: specs 13 §8, 14, 15, 16, 17 and conventions §9 at backend `ecbcd19`. Plan decisions: `release-2-plan.md` §4 (FR2-Q1…Q9).

### 12.1 Images
- Every image comes as `ImageDto { id, urls { thumb 200, medium 600, large 1200 }, width, height }` [SPEC 14]. The UI renders it with `<NileImage>` (`srcset` of the three widths, `sizes` per layout, intrinsic `width` / `height` so nothing jumps) (FR2-Q3).
- No image (`null`) → the brand placeholder (product or category, `../nile-brand/placeholders`), never an empty box.
- Alt text: the image's `altText` when present; else the product / category name; decorative repeats (the same image twice on a screen) get `alt=""`.
- The largest image of a page loads eagerly with high priority (the product's primary image on SF-05, the first card row on listings); every other image loads lazily.
- **Private images** (support attachments, return photos) have URLs that expire after 10 min [SPEC 14 ME-1]: never stored outside the query cache; a failed load refetches the owning resource once; they are never put in a share link or a notification.
- Product photos open in an accessible lightbox (dialog, arrow keys, Escape, focus returns).

### 12.2 Uploading images
- Picker: a button "Add photos" plus drag and drop on desktop; `accept="image/jpeg,image/png,image/webp"`; the input is keyboard operable and labelled with the limits ("JPEG, PNG or WebP, up to 5 MB each, at least 200 × 200 px").
- Checked before any request: type, size ≤ 5 MB, dimensions ≥ 200 × 200, the per-screen count limit. A refused file shows the reason under the picker and is not uploaded.
- Each file uploads as soon as it is picked (FR2-Q9), with its own tile: thumbnail preview from the local file, state **Uploading {n} %** → **Processing…** → **Ready**, or **Failed** with the reason and "Remove". Tiles can be removed before submit (nothing is sent to the API for a removed tile; the server deletes unattached uploads after 24 h).
- Submit stays disabled while any tile is uploading or processing, with the text "Wait for the photos to finish uploading."
- Status changes are announced politely (live region): "Photo 2 of 3 ready."
- Copy by code:

| Code / state | Message |
|---|---|
| type refused (client) | "Use a JPEG, PNG or WebP image." |
| size refused (client) | "This photo is larger than 5 MB." |
| dimensions refused (client) | "This photo is too small. Use one at least 200 × 200 pixels." |
| `MEDIA_OPEN_UPLOAD_LIMIT_REACHED` | "You have too many photos uploading. Wait a moment and try again." |
| `MEDIA_UPLOAD_INVALID`, `failed` `unsupported_type` | "This file isn't a valid image." |
| `failed` `decode_failed` | "We couldn't read this image. Try another one." |
| `failed` `dimensions_out_of_range` | "This image's size isn't supported. Try another one." |
| `MEDIA_UPLOAD_MISSING` after the upload URL expired, network failure | "The upload didn't finish. Try again." (retry on the tile) |
| `MEDIA_NOT_ATTACHABLE` on submit | The tiles named in `details` show "Upload this photo again." and the form stays open |
| `RATE_LIMITED` | conventions §4 countdown on the picker |

### 12.3 Live updates
- Screens refresh themselves when the backend says their data changed (realtime, X-3); there is no "refresh" button and no polling where a message covers it.
- A refetch never discards what the user is typing: if a form's underlying resource changes while it is being edited, the form keeps its values and shows "This was updated while you were editing. Review the changes before saving." with "Reload".
- Status changes on a visible screen are announced politely ("Order 2026-000123 is out for delivery.").
- Connection state is shown only where it matters: a support thread shows "Reconnecting…" while disconnected; elsewhere a dropped connection is silent (data is refetched on reconnect).
- Without a socket (blocked network, not yet connected) every screen still works through its normal fetches and the polling rules of the specs.

### 12.4 Notification centre
- A bell in every app's header for signed-in users, with the unread count (`99+` above 99; the API caps it at 100). Accessible name: "Notifications, {n} unread".
- Opening it shows the 10 newest (title, body, relative time, unread dot), "Mark all as read", and "See all" → the app's notifications page (load more, filter Unread / All, category chips).
- Selecting a notification marks it read and opens its mapped link (§12.5); a notification without a usable link only marks it read.
- New notifications arrive live (`notification.created`); the count updates without reload. Push and in-app texts come from the API as they are (English templates without names or amounts).

### 12.5 Notification links
The API's `link` is a route of one prefixed web app [SPEC 13 NO-12]. Each app maps the patterns it owns to its own routes (one module per app, tested); a link of another app or an unknown pattern is shown without a link (FR2-Q4).

| API link | storefront | seller | admin | agent |
|---|---|---|---|---|
| `/orders/{orderId}` | `/account/orders/{orderId}` | – | – | – |
| `/returns/{returnId}` | `/account/returns/{returnId}` | – | – | – |
| `/me/reviews/{reviewId}` | `/account/reviews?review={reviewId}` | – | – | – |
| `/support/tickets/{ticketId}` | `/account/support/{ticketId}` | `/support/{ticketId}` | – | – |
| `/seller/orders/{sellerOrderId}` | – | `/orders/{sellerOrderId}` | – | – |
| `/seller/returns/{returnId}` | – | `/returns/{returnId}` | – | – |
| `/seller/products/{productId}` | – | `/products/{productId}` | – | – |
| `/seller/reviews` | – | `/reviews` | – | – |
| `/seller/coupons/{couponId}` | – | `/coupons/{couponId}` | – | – |
| `/admin/support/tickets/{ticketId}` | – | – | `/support/{ticketId}` | – |
| `/agent/shipments/{shipmentId}` | – | – | – | `/shipments/{shipmentId}` |

### 12.6 Push notifications
- Never asked on page load. The notification preferences screen has "Turn on notifications on this device", and the bell panel shows a one-time, dismissible card "Get notified about your orders on this device" with the same button.
- Browser states: unsupported → "This browser can't show notifications."; permission denied → "Notifications are blocked for this site in your browser settings."; iPhone / iPad without the installed app → "On iPhone and iPad, add Nile to your Home Screen first." (FR2-Q2).
- A notification click focuses an open tab of the app or opens a new one at the mapped link.
- Sign-out unregisters the device before the session ends; if that fails, sign-out still happens.
- Preferences: one switch per category (Orders, Deliveries, Support, Offers), described as "Push notifications on this device and your other signed-in devices"; in-app notifications can't be turned off [SPEC 13 R-6]. Offers is off by default and has no sender yet [SPEC 13 NO-11].

### 12.7 Conversation threads (support)
- Oldest at the top, newest at the bottom; the view opens at the newest message and "Load earlier messages" sits at the top (the API pages newest first; the client reverses).
- Own messages aligned to the end with "You"; the other side named as the API gives it ("Nile Support" for users); `system` lines centred and muted; admin internal notes (admin app only) on a distinct background labelled "Internal note — not visible to the user" (not colour alone).
- Composer: multi-line text (1..4000), up to 3 photos (§12.2), "Send" button; Enter adds a line, Ctrl+Enter / ⌘+Enter sends. Sending is idempotent (one key per message intent); a failed send keeps the text and offers "Retry".
- New messages are announced politely; the view keeps its scroll position when the user has scrolled up, with "New messages ↓".
- Opening a thread marks it read; the list's unread mark follows `hasUnread`.

### 12.8 Ratings
- Display: five stars with the average, "4.3 (12 reviews)"; the accessible text is "Rated 4.3 out of 5 from 12 reviews". No reviews → "No reviews yet" (no stars).
- Averages are shown as the API's string (`"4.30"` → "4.3", one decimal, never recomputed).
- Rating input: a radio group of five labelled options ("1 star" … "5 stars"), arrow-key operable, required.

### 12.9 Amounts with discounts, returns and refunds
- Discounts are shown as negative amounts with their label: "Coupon SAVE10 −EGP 20.00".
- Every total, discount, refund and fee comes from the API; the only client arithmetic stays the checkout `expectedTotal` (spec 01 SF-07).
- Estimated amounts are labelled "Estimated" until final (return refund before completion).

### 12.10 Deadlines
Deadlines from the API (`sellerDecisionDeadlineAt`, `escalationDeadlineAt`, `inspectionDeadlineAt`, `reviewWindowEndsAt`, `windowEndsAt`) are shown as "Respond by 25 Oct, 14:00" and, under 24 h, as a countdown (§8). When one passes, the screen refetches (the backend's jobs decide what happens).

### 12.11 Default handling for the new common codes (adds to §4)

| Code | Default behaviour | Message |
|---|---|---|
| `MEDIA_NOT_ATTACHABLE` | §12.2 | – |
| `SERVICE_UNAVAILABLE` on an upload | Retry on the tile | "The upload didn't finish. Try again." |
| `*_NOT_FOUND` of a ticket / review / return / coupon in the route | Not-found page | – |
| `*_INVALID_STATUS_TRANSITION` (support, review, return) | §4 row (refetch + toast) | "This was already updated. We've refreshed the page." |
