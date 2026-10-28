# Release 2 Plan — Nile Marketplace Web

Status: **v1.0 APPROVED (2026-10-23)** with every recommendation of §4 (FR2-Q1…FR2-Q9; CLAUDE.md §14.1ao). Code for each phase starts only after its spec and design changes (T-J0) are approved (CLAUDE.md §0). Branch: `phase/j-r2-foundation` from `main`.

Inputs:
- Backend `main` at **`ecbcd1912055aacf19085a1335fe616a1e2267ab`** (merge of `r2-p7-coupons`, 64 commits after the pinned `4ad89a6`). Release 2 phases R2-P1…R2-P7 are merged; R2-P8 (backend hardening, staging) has not started [VERIFIED backend git log].
- Backend specs `00-overview` v2.0 §10, `01-api-conventions` v1.5 §9, `03`…`13` Release 2 sections, new specs `14-media` … `20-backoffice` [SPEC].
- Brand assets in `../nile-brand` (logo, logo variants, app icon, favicons, product and category placeholders) [VERIFIED].
- The frontend as on `main` (`e82ee15`, phase h merged) plus the unmerged `phase/i-hardening-release` (T-I1 CSP, T-I2 a11y, T-I3 performance) [VERIFIED].

## 0. How to read this plan

- New phases continue the lettering: **j** Release 2 foundation · **k** Storefront · **l** Seller · **m** Admin · **n** Agent · **o** Release 2 hardening. Ids `T-<phase><n>`, one reviewable PR per task, branches `phase/<letter>-<name>` (CLAUDE.md §12.1).
- The Definition of Done of `implementation-plan.md` §0.1 applies to every task.
- Labels: [VERIFIED] seen in backend code / OpenAPI / git · [SPEC] backend spec · [PROPOSED] this plan · [ASSUMPTION] to be proved · [OPEN] question in §4.

## 1. What the backend release changed

### 1.1 Size
- Pinned snapshot: **123** operations. The local backend container (built before R2-P6) serves **187**; `main` adds returns (16), coupons (10), coupon preview (1), seller holds (1) and refund detail / retry (2), so about **217** operations, about **94 new** [ASSUMPTION until T-J1 pulls the snapshot from a backend rebuilt at `ecbcd19`].
- No operation was removed [VERIFIED for the 187 served; ASSUMPTION for the rest].

### 1.2 New capabilities by area

| Area | What it is | Who uses it | Backend spec |
|---|---|---|---|
| Media | Presigned direct upload to S3 / MinIO, `complete`, async processing to WebP 200/600/1200; public CDN URLs, private presigned URLs (10 min) | seller, admin, customer | 14 |
| Product / category images | Up to 8 per product, ordered, primary = first, optional variant tie, alt text; one image per category; images on list items, detail, cart lines, order items (snapshot) | all | 06 §8, 08 §8, 09 §8.3 |
| Realtime | Socket.IO at `wss://<api>/realtime`, access JWT in `auth.token`, Origin allow-list, rooms per role; ids + statuses only, client refetches | all | 15 |
| Notification centre + Web Push | In-app list, unread count, read / read-all, push preferences per category, VAPID Web Push subscriptions | all | 13 §8 |
| Support tickets | Customer / seller → admin tickets, attachments (private images), status machine, admin queue, internal notes, assign / resolve / close, SLA flag | customer, seller, admin | 16 |
| Reviews, ratings | Verified reviews per delivered item (60 days), edit 30 days, seller reply once, admin hide / unhide; product and seller ratings, `rating` filter and sort | customer, seller, admin, public | 17, 06 §9, 05 §8 |
| Wishlist | Products, max 200, `product-ids` once per session | customer | 04 §8 |
| Public seller page | `GET /sellers/:sellerId` (name, rating, member since) | public | 05 §8.2 |
| Back-office | `GET /admin/dashboard`, user directory, customers, admin cancel of order / seller order, product block / unblock, audit log | admin | 20, 09 §8.4 |
| Returns | Request after delivery (14 days), seller approve / reject, escalation, admin decision, reverse shipment, seller receipt with restock choice, dispute, COD payout details | customer, seller, admin, agent | 18, 11 §8 |
| Refunds | Automatic Kashier refunds with retry → manual fallback; COD return refunds recorded by admin; refund detail with decrypted payout details; retry | admin (customer sees status) | 10 §8 |
| Holding period | Seller net held as `pending` until the return window closes; `available` may be negative; holds list | seller, admin | 12 §8 |
| Coupons | Platform coupons (admin) and seller-funded coupons (seller); preview in cart; `couponCode` at checkout; discount snapshots on orders | customer, seller, admin | 19, 09 §8.8 |
| Web token transport | Optional refresh-token cookie when the client sends `X-Nile-Client: web` | — (see §1.3) | 03 §8 |

### 1.3 Changes that affect screens already built (must be fixed even without new features)

| # | Change | Where it breaks or shows wrong data | Fix in |
|---|---|---|---|
| B-1 | `PaymentStatus` `partially_refunded_manually` / `refunded_manually` replaced by `partially_refunded` / `refunded` (expand/contract, PA-23) [SPEC] | `packages/domain` enums + labels, the type-only enum tests, storefront `order-detail.tsx` `REFUNDABLE` set, admin payment views | T-J1 |
| B-2 | `GET /seller/finance/balance` is now `{ available, pending, updatedAt }`, `available` may be negative [SPEC] | seller `balance-card.tsx` (`balance.balance`), overview, tests | T-J1 (shape), T-L2 (screen) |
| B-3 | `RefundStatus` adds `pending_auto`, `processing`, `succeeded`; refunds list returns every status; work queue is `pending_manual` [SPEC] | admin refund queue (T-H10) and its dashboard queue card | T-J1 (filter), T-M8 |
| B-4 | `ShipmentStatus` adds `pickup_failed`; `ShipmentKind` `delivery` / `return`; agent and admin shipment DTOs gain `kind`, `returnId` [SPEC] | agent lists and actions would offer delivery actions on return shipments; admin shipments | T-J1 (enums), T-N1, T-M7 |
| B-5 | Seller-order `cancelReason` adds `admin_cancelled` [SPEC] | label maps (customer, seller, admin) | T-J1 |
| B-6 | New finance account types and ledger entry / reference types [SPEC] | seller statement (shows unknown types raw, R-42), admin finance filters and labels | T-J1 |
| B-7 | Order DTOs gain `coupon`, `discountAmount`, `discountFunding`, `paidTotal`, `returnedQuantity`, `returned*` sums; checkout total = items − discount + delivery [SPEC] | order and seller-order detail amounts would no longer add up on screen once coupons exist | T-K4, T-L2 |
| B-8 | Admin dashboard: backend now serves aggregates (`GET /admin/dashboard`) [SPEC] | not broken; the five-queue dashboard (T-H6) can use them | T-M1 |
| B-9 | `X-Nile-Client: web` selects cookie transport on token endpoints [SPEC] | **not affected**: the BFF strips `X-Nile-Client` before calling the backend (`bff-route.test.ts`), E2E uses `nile-web-tests` (any value but `web` is a native client, IW-4) [VERIFIED]. Keep it that way; a test pins it | T-J1 (regression test) |
| B-10 | Notification `link` values are written for one web app with role prefixes: `/orders/<id>`, `/seller/orders/<id>`, `/agent/shipments/<id>`, `/admin/support/tickets/<id>`, `/returns/<id>`, `/me/reviews/<id>`, `/support/tickets/<id>`, `/seller/products/<id>`, `/seller/coupons/<id>`, `/seller/reviews` (NO-12, NO-31…NO-35) [SPEC] | our apps are four origins without those prefixes (storefront orders are `/account/orders/<id>`) | T-J6 link map (FR2-Q4) |
| B-11 | Socket handshake requires an `Origin` in the backend's `CORS_ALLOWED_ORIGINS`; storage bucket CORS allows `POST` only from the same list [SPEC] | the four app origins (4100–4103 locally) must be in the backend env | backend env (OQ-17) |

## 2. Frontend architecture impact

| Topic | Impact | Decision |
|---|---|---|
| Socket authentication | The socket needs the access JWT in browser JavaScript; CLAUDE.md §4 says tokens never reach browser JS | FR2-Q1 |
| CSP (T-I1) | `connect-src` must allow the storage upload origin and the realtime origin (`wss:`); `img-src` the CDN and the private-image (storage) origin; `worker-src 'self'` for the push service worker | T-J3/T-J4/T-J5/T-J6, new env keys |
| Images | API returns ready-made WebP widths 200/600/1200 → a plain `<img srcset>` component, no Next.js image optimiser (no server fetch of private presigned URLs, no `remotePatterns`) | FR2-Q3 |
| CLAUDE.md §7 "No product images in R1" | Lifted in R2 | T-J0 doc change |
| BFF allow-lists (design 02) | Every new operation added per app and role; the upload POST to storage goes browser → storage directly (no token involved, presigned) | per task |
| Query keys / invalidation (design 02) | New resources; a realtime message → invalidation map | T-J5 |
| Idempotency | Required on ticket open, ticket message, return request, seller receipt confirm, admin dispute resolve, admin cancels (`useIdempotentMutation`) | per task |
| Private images | Presigned URLs expire after 10 min: never cached beyond the query's life; `staleTime` below the TTL; refetch on `<img>` error once | T-J3 |
| New dependencies | `socket.io-client` (if FR2-Q1 ≠ polling). No chart library (FR2-Q6). No upload library (`fetch` + `FormData`) | FR2-Q1, FR2-Q6 |
| Brand | Logo, icon, favicons, placeholders; token palette vs brand palette | FR2-Q5 |

## 3. Phases and tasks

### Phase j — Release 2 foundation (`phase/j-r2-foundation`)

#### T-J0 Release 2 discovery and spec / design updates
- **Status (2026-10-23):** approved with every recommendation: `api-inventory.md` §11, `workflows.md` §6, spec 00 §12 (v1.1), spec 01 §10 (v1.2), spec 02 §8, spec 03 §7, spec 04 §7 (v1.1 each), design 01 §15 and design 02 §5 (v1.1), CLAUDE.md §1/§2/§4/§5/§7/§9 rule text for FR2-Q1…Q4. Open questions: SF-Q-13…20, SE-Q-9…14, AD-Q-10…17, AG-Q-7…8, DQ-10…14.
- **Scope:** `api-inventory.md` v2 (new operations, errors, enums, OpenAPI defects), `workflows.md` v2 (new workflows per role), spec 00 conventions (images, realtime freshness, notification centre, upload states), specs 01–04 new screens per §3 below with their own SF/SE/AD/AG questions, design 01 (media, realtime, push, CSP, env keys) and design 02 (allow-lists, query keys, mutations, realtime invalidation map), CLAUDE.md §1/§4/§7 changes that follow from §4.
- **Exclusions:** code.
- **Acceptance:** every new operation mapped to a screen or marked "not used in R2"; every [OPEN] item has options and a recommendation; you approve the documents.

#### T-J1 Contract adoption and breaking fixes
- **Status (2026-10-23):** implemented; format, lint, type-check, `api:check`, 1529 unit/component tests and the build of the four apps green locally. Not yet run: the live contract suite (`npm run test:contract`, needs the E2E settings) and E2E. Snapshot pinned to `ecbcd19` (217 operations; served by the backend built from `dev-realistic-seed`, which changes no route or DTO). Found on the way and recorded: `StockMovementType` `return_restock`, error codes `KASHIER_TOTAL_ZERO` and `ORIGIN_NOT_ALLOWED`, `AuthTokensDto.refreshToken` nullable (OA-R2-7…9).
- **Scope:** rebuild and start the backend at `ecbcd19`; `api:pull --commit ecbcd19…` → `api:gen`; fix-script corrections for new defects; `error-codes.ts` (media, support, reviews, returns, coupons, refunds, wishlist, back-office codes); domain enums + labels (B-1, B-3…B-6, new enums: media, support, review, return, coupon, notification); fix B-1, B-2 (shape only), B-3 (queue filter `pending_manual`), B-5, B-6; regression test that the BFF never forwards `X-Nile-Client` (B-9); contract tests for the changed DTOs.
- **Acceptance:** `api:check`, type-check, lint, tests green; existing screens behave as before against the new backend (E2E smoke per app).

#### T-J2 Brand assets
- **Status (2026-10-23):** implemented; format, lint, type-check, 1536 tests and the build green; screenshots of the four headers and the token page taken from the dev servers. Deviations: the storefront header uses the short logo (mark + "nile"): at header height the full logo's "marketplace" line is about 5 px and unreadable; the full logo is the storefront share image. No mono logos (no dark surface exists yet). Manifest icons are in `public/icons/` for T-J6. Re-based token page (`/design/tokens`, FR2-Q5) approved 2026-10-28.
- **Scope:** SVG logo components in `packages/ui` (horizontal for the storefront header, short horizontal + role label for seller / admin / agent, mark for small widths, mono for dark surfaces), app icons and favicons per app (`app/icon.svg`, `app/apple-icon.png` 180, `favicon.ico`), Open Graph image for the storefront, product and category placeholders, `PlaceholderScreen`/auth screens with the logo; token page updated; palette per FR2-Q5 with the contrast tests.
- **Acceptance:** every app shows the logo and its icon in the tab; axe clean; logo has an accessible name ("Nile Marketplace"); no layout shift (fixed dimensions).

#### T-J3 Image display
- **Status (2026-10-28):** implemented: `NileImage`, `PrivateImage` (`packages/ui`), `variantImage` / `primaryImage` / `imageAlt` (`@nile/domain`), component tests for null, public and private-expired, type tests against the image DTOs. Deferred to the phase i merge (TB-4, decided 2026-10-28): CSP `img-src` with the env keys `NEXT_PUBLIC_MEDIA_PUBLIC_ORIGIN` / `NEXT_PUBLIC_MEDIA_PRIVATE_ORIGIN`, and the T-I3 Lighthouse budgets with images (no page shows images before T-K1).
- **Scope:** `<NileImage image sizes alt placeholder>` in `packages/ui` (`srcset` from `urls`, width/height to avoid CLS, lazy except LCP image, brand placeholder when `null`); CSP `img-src` env-driven; private-image handling (refetch once on load error); `@nile/domain` helper for the variant image rule (variant `imageId` else primary).
- **Acceptance:** component tests for null, public, private-expired; Lighthouse budgets (T-I3) still met on product and category pages with images.

#### T-J4 Upload pipeline
- **Status (2026-10-28):** implemented: `storageUpload` (`@nile/api`, XHR with progress), new package `@nile/media` (`checkImageFile`, `uploadImage`, `waitForMedia` with a `subscribe` hook for T-J5, `useImageUploads`), `UploadTiles` (`@nile/ui`); OA-R2-10 fix for `UploadFormDto.fields`; MSW tests for every `MEDIA_*` code and the client refusals before any request. Deferred: CSP `connect-src` / `img-src blob:` with `NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN` (phase i merge, TB-4); the E2E upload against MinIO waits for the first screen with an uploader (T-L1 or T-K5) (approved 2026-10-28).
- **Scope:** `useImageUpload(purpose)` in a shared package: client checks (jpeg/png/webp, ≤ 5 MB, ≥ 200 × 200 read from the file) → `POST /media/uploads` (BFF) → multipart `POST` to the presigned URL with the given `fields` → `complete` → wait for `ready` (socket `media.updated` when FR2-Q1 allows, else poll `GET /media/:id` with back-off, visible tab only) → returns `mediaId` + preview; states idle / uploading (progress) / processing / ready / failed with error-code copy (`MEDIA_*`); cancel; CSP `connect-src` for the upload origin; an `ImageUploader` UI (drop zone + button, keyboard accessible, multiple files up to a limit).
- **Acceptance:** MSW tests for each `MEDIA_*` code, size and type rejection before any request; E2E upload against MinIO.

#### T-J5 Realtime client (depends on FR2-Q1)
- **Status (2026-10-28):** implemented: `POST /api/auth/realtime-token` in `@nile/auth` (POST, not GET: browsers send no `Origin` on a same-origin GET, decided 2026-10-28), `fetchRealtimeToken`, socket message types in `@nile/api`, new package `@nile/realtime` (connection, provider, `useRealtimeStatus` / `useRealtimeConnected` / `useRealtimeMessage`, `useTicketRoom`, `useTypingSignal`), `NEXT_PUBLIC_REALTIME_URL`, a `RealtimeKeeper` per app with its invalidation map (storefront orders, seller orders and overview, agent shipments and profile; admin empty until phase m / T-J6); fallback polling only while no socket is connected (SF-18, seller orders, agent active lists); SF-09 waits 30 s for `payment.updated`, then polls every 5 s (spec 01 v1.2). Unit tests with a fake socket; E2E `e2e/storefront/live-updates.spec.ts` written, not yet run here (needs the E2E settings). CSP `connect-src` for the realtime origin waits for phase i (TB-4).
- **Scope:** `@nile/realtime` (client-only): one connection per tab while signed in and visible, token via the chosen path, reconnect with back-off, reconnect after `token_expired` / `session.ended`, `UNAUTHENTICATED` → session check; dedupe by `eventId` + `type`; refetch everything shown after a reconnect; message → query-key invalidation map per app; `ticket.subscribe` / `unsubscribe`; the Kashier return page waits for `payment.updated` with the 5 s poll fallback (RT-4). Polling that exists today (order awaiting payment, T-G3) is replaced only where a socket message covers it.
- **Acceptance:** unit tests with a fake socket (dedupe, reconnect, invalidation); E2E: an order state change by the seller shows on the customer's open order page without reload.

#### T-J6 Notification centre, preferences and Web Push
- **Scope:** header bell with unread count (socket `notification.created` or a visible-tab poll), list with load more, mark read / read all, per-app link map (B-10, FR2-Q4) with unknown links shown without a link; preferences screen (four categories, push only); Web Push: `public/sw.js` per app (show notification, focus / open the mapped link), `GET /push/config`, subscribe after an explicit user action (never on page load), `POST /me/push-subscriptions`, unregister before logout and on session end; web app manifest per app with brand icons (FR2-Q2).
- **Acceptance:** tests for count, read, link map, preference save (only changed categories, NO-18), permission denied / unsupported browser states; E2E: a seller action creates a customer notification that appears in the bell.

### Phase k — Storefront (`phase/k-storefront-r2`)

| Task | Scope | Main endpoints |
|---|---|---|
| T-K1 Images and ratings in the catalog | Images on cards, product gallery with variant switch, category tiles; rating stars + count on cards and detail; `rating[gte]` filter and `-rating` sort in the URL mapping (R-28); seller rating on the detail | `GET /products`, `/products/{id}`, `/categories` |
| T-K2 Product reviews | Rating summary + distribution, reviews list (filter by rating, with images), images lightbox, seller reply | `/products/{id}/reviews`, `/reviews/summary` |
| T-K3 Wishlist | Heart on cards and detail (signed in; signed out → login with return), `product-ids` once per session, wishlist page with unavailable items, limit message | `/me/wishlist*` |
| T-K4 Coupon at checkout | Coupon field on checkout: preview, applied discount per order, remove; `couponCode` + new `expectedTotal`; `COUPON_*` errors; coupon and discount lines on confirmation and order detail (B-7) | `/cart/coupon-preview`, `/checkout`, `/orders/{id}` |
| T-K5 Write and manage reviews | "To review" list, write from a delivered order item (rating, title, body, up to 4 images), my reviews, edit within the window, delete | `/me/reviewable-items`, `/reviews`, `/me/reviews*` |
| T-K6 Returns | "Return items" on a delivered seller order inside the window: items and quantities, one reason, description, photos (≥ 1 for seller-fault), fee and estimated refund, COD payout details (wallet / InstaPay); returns list and detail with timeline, refund status, cancel, escalate | `/returnable-items`, `/returns*` |
| T-K7 Support | My tickets, open a ticket (category, subject, message, optional order, attachments), thread with "Nile Support" messages, reply, read state, realtime updates and typing indicator | `/support/tickets*` |
| T-K8 Seller page and order updates | Public seller page (name, rating, member since, products via `sellerId`), link from the product; order detail shows refunds, returned quantities and admin cancellation; realtime refresh | `/sellers/{id}`, `/orders/{id}` |

### Phase l — Seller portal (`phase/l-seller-r2`)

| Task | Scope | Main endpoints |
|---|---|---|
| T-L1 Product images | Image manager on the product: upload (up to 8), reorder (keyboard-operable, not drag only), set primary by moving first, tie to a variant, alt text, remove; blocked product state (`adminBlocked`, reason, status locked: `PRODUCT_BLOCKED`) | `/seller/products/{id}/images*` |
| T-L2 Finance and order amounts | Available (may be negative, explained) and pending balance, holds list (`blockedByReturn`), new ledger entry labels; seller order shows discount, funding and returned sums | `/seller/finance/balance`, `/holds`, `/entries`, `/seller/orders/{id}` |
| T-L3 Returns | Returns queue (deadline sort), detail without customer data, approve, reject with reason, confirm receipt with restock choice per item (idempotent), dispute with reason and photos; overview card | `/seller/returns*` |
| T-L4 Reviews | Reviews of my products (filters: product, rating, replied, dates), reply once (approved sellers only) | `/seller/reviews*` |
| T-L5 Coupons | Coupon list, create (seller / category scope), edit with locked fields after the first redemption (PR-8), blocked state | `/seller/coupons*` |
| T-L6 Support | Tickets as in T-K7 with seller categories (`seller_onboarding`) and seller-order links | `/support/tickets*` |

### Phase m — Admin console (`phase/m-admin-r2`)

| Task | Scope | Main endpoints |
|---|---|---|
| T-M1 Dashboard | Figures from `GET /admin/dashboard` (orders by status, placed / delivered GMV for 30 days, top sellers, support, finance, delivery, returns, `generatedAt`), keeping the existing queue cards | `/admin/dashboard` |
| T-M2 Users and customers | User directory (role, status, email prefix, dates), customer list (name, phone) and detail with orders | `/admin/users`, `/admin/customers*` |
| T-M3 Admin cancellation | Cancel a seller order or a whole order with a required reason; `ORDER_NOT_CANCELLABLE` names the blocking seller orders; idempotent | `/admin/seller-orders/{id}/cancel`, `/admin/orders/{id}/cancel` |
| T-M4 Product block and category images | Admin product view, block (reason) / unblock; category image set / remove in the category editor (T-H8) | `/admin/products/{id}*`, `/admin/categories/{id}/image` |
| T-M5 Support console | Queue (status, category, opener role, assigned / mine, SLA breached, oldest waiting), thread with internal notes, reply, assign / unassign, resolve, close, realtime new tickets | `/admin/support/tickets*` |
| T-M6 Review moderation | Reviews list (status, product, seller, customer, rating), hide / unhide review and reply with reason | `/admin/reviews*` |
| T-M7 Returns | Returns list and detail with history, decide escalated / requested, resolve dispute (idempotent); return shipments in shipment views (`kind` filter) | `/admin/returns*`, `/admin/shipments` |
| T-M8 Refunds and finance | Refund queue on every status (work queue `pending_manual`), detail with decrypted COD payout details (never logged), retry, record; new account and entry types in finance | `/admin/payments/refunds*`, `/admin/finance/*` |
| T-M9 Coupons | Platform coupons list / create / edit, seller coupons block / unblock with reason, redemptions on the detail | `/admin/coupons*` |
| T-M10 Audit log | Audit list with filters and entry detail (before / after) | `/admin/audit-log*` |

### Phase n — Agent app (`phase/n-agent-r2`)

| Task | Scope | Main endpoints |
|---|---|---|
| T-N1 Return pickups | Return shipments in the lists (pickup at the customer, drop-off at the seller, nothing to collect), pickup-failed attempts with the return reasons, "handed to seller" action, `pickup_failed` status | `/agent/shipments*` (`kind`) |
| T-N2 Live updates | New assignment arrives through realtime and push (`high` urgency); lists refresh on `shipment.assigned` / `shipment.unassigned` | realtime, push |

### Phase o — Release 2 hardening (`phase/o-r2-hardening`)
- **T-O1 Security review:** uploads (type / size checks, private URLs never persisted or logged), socket (token handling per FR2-Q1, origin), push (no PII in payload display), CSP report-only run then enforce, idempotency of every money / stock action.
- **T-O2 Accessibility:** keyboard specs extended (uploader, reorder, chat thread, star rating input, notification menu); screen-reader checklist rows for live regions (new messages, upload status).
- **T-O3 Performance:** budgets re-run with real images (LCP image `fetchpriority`), socket client lazy-loaded off the critical path, bundle check.
- **T-O4 E2E:** one workflow per new feature per role, including returns end to end (customer → seller → agent → seller → refund) and coupon checkout.

### Dependency summary
`T-J0` → `T-J1` → (`T-J2`, `T-J3`, `T-J4`, `T-J5`, `T-J6` in any order; `T-J6` after `T-J5` when FR2-Q1 is a socket) → phases k, l, m, n in parallel (cross-role features land together where E2E needs both sides: returns K6 + L3 + M7 + N1, support K7 + L6 + M5, coupons K4 + L5 + M9) → phase o.

Suggested order of delivery (most user value and least risk first): J → K1/K3/L1/M4 (images, wishlist) → K2/K5/L4/M6 (reviews) → K4/L5/M9 (coupons) → K7/L6/M5 (support) → K6/L3/M7/M8/N1 (returns and refunds) → M1/M2/M3/M10 → N2 → O.

## 4. Questions to answer before T-J0 ends

| # | Topic | Options / recommendation |
|---|---|---|
| FR2-Q1 | Socket authentication with the BFF (tokens never reach browser JS, CLAUDE.md §4) | **Rec:** a BFF route `GET /api/auth/realtime-token` (same-origin, `X-Nile-Client` + Origin check, `no-store`) returns the current access token for the socket handshake only; kept in a module variable, never stored, fetched again on `token_expired`. Exposure is one 15-min access token to XSS, mitigated by the nonce CSP; the refresh token never leaves the server. CLAUDE.md §4 gets a written exception · or **no socket in R2**: visible-tab polling for the unread count (60 s), open ticket threads (10 s) and the Kashier return page (as today); simpler and keeps §4 intact, but no live updates · or a server-side relay (custom Node server + SSE): keeps tokens server-side but breaks the standard Next.js deployment |
| FR2-Q2 | Web app manifest (iOS shows Web Push only for installed web apps) | **Rec:** add a manifest to every app (name, brand icons, `display: standalone`, theme colour) so push works on iOS 16.4+ once installed; still no offline mode (AG-Q-5 unchanged) · or no manifest (no push on iPhones) |
| FR2-Q3 | Image rendering | **Rec:** own `<NileImage>` with `srcset` from the three API widths, no `next/image` optimiser · or `next/image` with `remotePatterns` and `unoptimized` (little gain, more config) |
| FR2-Q4 | Notification links written for one prefixed web app (B-10) | **Rec:** a per-app link map in the frontend (known patterns → our routes, unknown → no link) and a backend question to freeze the link list as a contract (OQ-18) · or ask the backend to send app-relative links per role (backend change) |
| FR2-Q5 | Brand palette vs approved tokens (FQ-5: primary `#0B5C7A`); the brand uses navy `#0E2A3B`, teal `#1F6F80`, light teal `#5FB3C2`, gold `#E2A93B` | **Rec:** re-base the tokens on the brand: primary teal `#1F6F80` (5.8:1 on white), navy for headings / header, gold only as a decorative accent (never text on white: too low contrast); token page re-approved · or keep the current tokens and use the logo as it is |
| FR2-Q6 | GMV chart on the admin dashboard | **Rec:** no chart dependency: an accessible table plus simple inline SVG bars built in `packages/ui` · or approve a chart library (e.g. Recharts) |
| FR2-Q7 | Where the customer's new pages live | **Rec:** under `/account`: `/account/wishlist`, `/account/reviews`, `/account/returns`, `/account/support`, `/account/notifications`; seller page at `/s/[sellerId]` (keeps `/search?seller=` working) · or top-level routes |
| FR2-Q8 | Phase i is not merged; T-I4…T-I6 are open and T-I5 waits for hosting | **Changed by the user (2026-10-23):** phase i stays unmerged for now; phase j branches from `main` (CLAUDE.md §14.3 TB-4). Original **Rec:** merge `phase/i-hardening-release` (T-I1…T-I3) to `main` now; phase j branches from `main` after that; T-I4…T-I6 stay open and run when hosting (FQ-3) is decided · or finish T-I4…T-I6 first |
| FR2-Q9 | Review images and return photos: how many uploads at once | **Rec:** files upload one after another as they are picked, with per-file status; submit stays disabled until all are `ready` · or upload only on submit (slower, one failure blocks the form) |

### 4.1 Questions for the backend owner (to add to CLAUDE.md §14.3 when approved)

| # | Topic | Recommendation |
|---|---|---|
| OQ-17 | `CORS_ALLOWED_ORIGINS` (socket handshake and storage bucket CORS) must list the four web origins (`http://localhost:4100…4103` locally, the real ones once FQ-8 is decided) | Backend env change only |
| OQ-18 | Notification `link` values assume one prefixed web app (NO-12) | Confirm the list is stable (a contract) so the frontend map is safe; later, consider app-relative links per role |
| OQ-19 | The local backend container predates R2-P6/P7 (no returns or coupon routes) | Rebuild the api, worker and realtime images at `ecbcd19` before T-J1; keep `dev-realistic-seed` out of the pinned commit until merged |
| OQ-20 | `GET /admin/dashboard`, `/admin/users`, etc. reach the backend from the BFF's IP (OQ-1 still open) | No change; OQ-1 still blocks production |

## 5. Risks

- **Size:** about 45 new screens across four apps. The order in §3 lets a usable subset ship early.
- **Socket and push are new runtime pieces** (service worker, long-lived connections) in an app that so far only made request/response calls; FR2-Q1 decides most of the security impact.
- **CSP:** every new origin (storage, CDN, realtime) is an env value; a wrong value silently breaks uploads or images, so each gets a startup check and an E2E test.
- **Money on screen:** coupons, returns and holds change how totals add up; amounts are always shown from the API, never recomputed (T-F1 rule), except the checkout `expectedTotal` with `decimal.js`.
