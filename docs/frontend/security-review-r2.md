# Release 2 security review (T-O1)

Status: **in progress** (2026-10-31). Code review of the Release 2 surfaces on `phase/o-r2-hardening` (backend
`ecbcd19`). The CSP report-only and enforced runs happen in the phase o lab session (CLAUDE.md §14.1bz TO-Q1).
Decisions go to design 01 R-89.

Severity: **High** (exploitable or money / stock wrong without user error) · **Medium** (wrong outcome after a
plausible user action, or personal data exposure) · **Low** (defence in depth, test gap) · **Info** (checked, fine).

## 1. Findings

| # | Area | Severity | Finding | Fix | Test | State |
|---|---|---|---|---|---|---|
| F-1 | Idempotency | Medium | The key of `useIdempotentMutation` lives in a `useRef` of the component that holds the action. Most actions live in dialogs, sheets or pages that are **unmounted** when closed or left (e.g. `RecordRemittanceDialog` is rendered only while `recording`). After an ambiguous failure (network error, `5xx`) whose request the backend did apply, closing and reopening the dialog and confirming the same values sends a **new key**: the action runs twice. No backend rule stops the duplicate for: COD remittance (only the agent's cash balance limits it), stock adjustment by delta, agent failed return pickup (allowed again from `pickup_failed`, so it counts toward the 3-attempt limit [VERIFIED backend `shipment-work.service.ts`]), support ticket and support message. Status transitions (cancels, receipt, delivered, refund record, return decisions) and payouts (`PAYOUT_ALREADY_RECORDED` on the reference) are refused the second time | `useIdempotentMutation` keeps `{ intent, key }` per required `intentScope` (action + target) in a tab-memory store of `@nile/query`, cleared on success, `resetIntent()` and sign-out (`clearPrivateQueries`); every call site passes its scope (TO1-Q1, design 01 R-89) | `idempotent-mutation.test.tsx` (survives unmount, per scope, cleared on sign-out); close-and-reopen tests for remittance, stock, return-pickup failed attempt, support ticket, admin reply | Fixed |
| F-2 | Logging | Low | `@nile/logger` redaction list had no R2 personal fields; COD refund payout details (`walletNumber`, `instapayAddress`) would be written if a future log call passed a body or a validation detail | Both keys added to `REDACTED_KEYS` | `packages/logger/src/index.test.ts` | Fixed |
| F-3 | Idempotency tests | Low | Retry-with-the-same-key is not tested for: admin payout, storefront return request, support ticket open, seller return received (R1 parcel), seller item cancel, admin support reply / internal note. The code path is the shared hook (tested in `@nile/query`), but CLAUDE.md asks for a test per action | Tests added per action | `money-actions.test.tsx` (payout), storefront `returns.test.tsx`, `new-ticket-form.test.tsx`, seller `order-detail.test.tsx` (return received, item cancel), admin `support.test.tsx` | Fixed |

## 2. Checked, no finding

| Area | What was checked | Evidence |
|---|---|---|
| Uploads | Every uploader goes through `useImageUploads`, which runs `checkImageFile` (type, size, decoded dimensions) before `POST /media/uploads`; `storageUpload` sends no credentials, fields before the file; object URLs revoked; no upload URL stored or logged; storage origin limited by CSP `connect-src` (env) | `packages/media/src/*`, `packages/api/src/storage-upload.ts` |
| Private images | `PrivateImage` never shows a failed URL again, asks the owner to refetch once; no image URL in `href`, `window.open`, storage or logs; query cache is memory only (no persister) | `packages/ui/src/components/private-image.tsx` |
| Realtime token | `POST /api/auth/realtime-token`: CSRF check (Origin + `X-Nile-Client`) like every auth action, `no-store`, never refreshes (near expiry → `UNAUTHENTICATED`), logs the user id only; the token lives in the `auth` callback of `@nile/realtime`, not in state, storage or the cache; refused connections warn with the code only | `packages/auth/src/route-handlers.ts`, `packages/realtime/src/connection.ts`, `auth-routes.test.ts` |
| Push | `sw.js` shows only the payload's `title` and `body` (backend texts carry numbers only, X-2.4); a click opens `/notifications/open?link=`, which maps the link with the app's map and redirects only to a same-origin path (plain segments, ids `[A-Za-z0-9_-]{1,64}`, never `//` or `\`); `localStorage` keeps only the endpoint | `packages/notifications/src/service-worker.js`, `packages/domain/src/notification-links.ts` |
| Rendering | No `dangerouslySetInnerHTML` / `innerHTML` anywhere in `apps/*/src` or `packages/*/src`; reviews, replies, tickets and return descriptions render as React text | grep |
| Browser console | Only `console.warn` with a refusal code or an unexpected ledger entry type and id | grep |
| BFF logs | The request log carries method, route, status, duration and user id; bodies are never logged | `packages/auth/src/route-handlers.ts` |
| Allow-lists | Every R2 operation per design 02 §1 (test reads the design) | `packages/api/src/allow-lists.test.ts` |
| Dependencies | `npm run audit`: 0 blocking advisories (2026-10-31) | CI `audit` |

## 3. Idempotent operations

Every operation of the snapshot that takes an `Idempotency-Key` (20), its call site and the test of key reuse on a
retry of the same intent. All go through `useIdempotentMutation` (`@nile/query`), which is never retried by
TanStack, re-sends only `IDEMPOTENCY_REQUEST_IN_PROGRESS` with the same key, and keeps the key per `intentScope`
for the tab (F-1).

| Operation | Call site | Duplicate refused by the backend without the key? | Retry test |
|---|---|---|---|
| `POST /admin/finance/cod-remittances` | admin `RecordRemittanceDialog` | No (balance cap only) | `money-actions.test.tsx` |
| `POST /admin/finance/payouts` | admin `RecordPayoutDialog` | Yes, same reference (`PAYOUT_ALREADY_RECORDED`) | `money-actions.test.tsx` |
| `POST /admin/orders/{orderId}/cancel` | admin `CancelDialog` | Yes (status) | `cancel.test.tsx` |
| `POST /admin/seller-orders/{sellerOrderId}/cancel` | admin `CancelDialog` | Yes (status) | `cancel.test.tsx` |
| `POST /admin/payments/refunds/{refundId}/record` | admin `RecordRefundDialog` | Yes (status) | `refund-detail.test.tsx` |
| `POST /admin/returns/{returnId}/resolve-dispute` | admin `DecisionDialog` | Yes (status) | `returns.test.tsx` (admin) |
| `POST /admin/support/tickets/{ticketId}/messages` | `@nile/support-screens` `Composer` (admin) | No | admin `support.test.tsx` |
| `POST /agent/shipments/{shipmentId}/delivered` | agent `DeliveredSheet`, `ShipmentActions` (R3) | Yes (status) | `shipment-view.test.tsx` |
| `POST /agent/shipments/{shipmentId}/failed-attempt` | agent `FailedAttemptSheet` | Delivery yes (needs `out_for_delivery`); return pickup no (counts an attempt) | `shipment-view.test.tsx` (R2) |
| `POST /agent/shipments/{shipmentId}/returned` | agent `ShipmentActions` | Yes (status) | `shipment-view.test.tsx` |
| `POST /checkout` | storefront `CheckoutView` | Partly (cart emptied) | `checkout.test.tsx` |
| `POST /orders/{orderId}/seller-orders/{sellerOrderId}/cancel` | storefront `CancelSellerOrder` | Yes (status) | `cancel-seller-order.test.tsx` |
| `POST /returns` | storefront `RequestReturn` | Yes (one open return per seller order) | storefront `returns.test.tsx` |
| `POST /seller/orders/{sellerOrderId}/cancel` | seller `OrderActions` | Yes (status) | `order-detail.test.tsx` |
| `POST /seller/orders/{sellerOrderId}/items/{itemId}/cancel` | seller `CancelItemDialog` | Partly (open quantity) | `order-detail.test.tsx` |
| `POST /seller/orders/{sellerOrderId}/return-received` | seller `OrderActions` | Yes (status) | `order-detail.test.tsx` |
| `POST /seller/returns/{returnId}/confirm-receipt` | seller `ReturnActions` | Yes (status) | `returns.test.tsx` (seller) |
| `POST /seller/variants/{variantId}/stock-adjustments` | seller `StockAdjustDialog` | No (delta applied twice) | `stock.test.tsx` |
| `POST /support/tickets` | `@nile/support-screens` `NewTicketForm` | No (up to 20 open) | `new-ticket-form.test.tsx` |
| `POST /support/tickets/{ticketId}/messages` | `@nile/support-screens` `Composer` | No | `ticket-thread.test.tsx` |

## 4. CSP runs

To do in the lab session: report-only over the whole E2E suite (local, uncommitted `CSP_REPORT_ONLY = true`), fixes,
then the enforced run with the `cspGuard` fixture.
