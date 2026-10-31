# Performance (T-I3)

Status: budgets, tooling and the nightly run are in place; first bundle fixes done; **the budget verdict on the
real catalog, product and cart pages comes from the first nightly run** (it needs the backend with seed data).

## 1. Budgets and how they are checked

| Metric | Budget | Gate |
|---|---|---|
| Largest Contentful Paint | < 2.5 s | error |
| Cumulative Layout Shift | < 0.1 | error |
| Total Blocking Time (lab stand-in for INP: a navigation run has no interactions) | < 200 ms | error |
| First Contentful Paint | < 1.8 s | warning |
| JavaScript transferred | < 350 KB | warning |

- Profile: Lighthouse's default mobile run (a mid-range phone, slow 4G, 4× CPU slowdown, simulated
  throttling), 3 runs per URL, the median run judged (`e2e/perf/lighthouserc.cjs`).
- Pages: storefront home, the first category's listing, the first in-stock product (signed out, as search
  engines and new visitors see them) and the cart (signed in, one item).
- Local: `npm run build` (at least the storefront), the backend with seed data and Mailpit, the `E2E_*`
  settings, then `npm run perf`. Reports: `lighthouse-report/` and `.lighthouseci/` (git-ignored).
- Nightly: `.github/workflows/perf.yml` (backend pinned in `backend.lock.json`, as `contract.yml`); the reports
  are uploaded as the `lighthouse-report` artifact.
- Tooling: `@lhci/cli` 0.15.1 (approved 2026-10-16) with Lighthouse overridden to 13.5.0: the bundled 12.6.1
  can't read current Chrome traces (`NO_NAVSTART`). `basic-ftp` and `tmp` are overridden to patched releases
  (no audit exception needed; Lighthouse 13.5 no longer pulls `extract-zip`).

## 2. Bundle analysis

Measured on the storefront's production build (`/login`, the lightest page with the full shell; `next
experimental-analyze` for the module view, compressed transfer sizes from the browser):

| | Before | After |
|---|---|---|
| JavaScript transferred | 370 KB (13 scripts) | 310 KB (19 scripts) |
| Zod | 92 KB, **every locale** (German, Spanish, Polish, …) | 33 KB core + about 15 KB in small chunks |

Fixes:
1. **Zod imports**: `import { z } from 'zod'` made Turbopack keep the whole `z` namespace, every locale
   included (Zod's own source notes Rollup and Webpack shake it; Turbopack doesn't). All 58 imports are now
   `import * as z from 'zod'` (`import type * as z` for types): same API, −59 KB.
2. **`sideEffects`** declared in the workspace packages (`false`; `@nile/domain` lists `zod-config.ts`, which
   must run), so unused barrel modules can be dropped (the design gallery no longer reaches other pages).
3. **`percentRate`** moved out of `fields` into `@nile/domain`'s `rate-field.ts`: forms without money don't pull
   decimal.js through it.

Tried and reverted: `experimental.optimizePackageImports` for our packages and `radix-ui` (no measurable change:
the remaining modules are really used by the shell's components).

What remains on every storefront page: React and the Next.js runtime (≈ 125 KB), Radix primitives used by the
shell (menus, dialog/drawer, toasts: ≈ 85 KB), TanStack Query (≈ 30 KB), Zod (≈ 48 KB), React Hook Form, decimal.js
(≈ 14 KB, through the shell's money display), Lucide icons.

## 3. First lab numbers (local, indicative only)

Local production build, Lighthouse mobile profile, on a development machine also running the four dev servers
(noisy: the nightly run on a clean runner is the reference). Only pages that render without the backend:

| Page | FCP | LCP (simulated) | TBT | CLS |
|---|---|---|---|---|
| `/login` before the fixes | 0.77 s | 2.7 s | 486 ms | 0 |
| `/login` after | 0.77 s | 3.6 – 3.8 s | 400 – 560 ms | 0 |
| `/design/components` after | 0.77 s | 3.5 s | 594 ms | 0 |

- The page actually paints its largest element at first paint: observed (unthrottled) LCP = FCP = 0.54 s. The
  simulated LCP is long because Lighthouse's model counts the download of the high-priority scripts on slow
  4G; it moves with the amount of JavaScript (and with machine load: the "before" run was on a quieter machine).
- TBT is mostly React and the Next.js runtime evaluating at 4× CPU slowdown (≈ 0.8 s in one chunk).
- CLS is 0 everywhere measured (self-hosted font with size-adjusted fallback, no images in R1).

First run on the budgeted pages (2026-10-28, `npm run perf` against the local backend in Docker, phase i with
the R2 merge; median of 3, mobile profile):

| Page | FCP | LCP (simulated) | Observed LCP | TBT | CLS | JS transferred |
|---|---|---|---|---|---|---|
| `/` | 0.80 s | 3.7 s | 0.29 – 0.39 s | 594 ms | 0 | 341 KB |
| `/c/women` | 0.96 s | 3.9 s | 0.31 – 0.46 s | 620 ms | 0.002 | 341 KB |
| `/p/[slug]` | 0.79 s | 3.7 s | 0.28 – 0.44 s | 558 ms | 0 | 341 KB |
| `/cart` (signed in) | 0.78 s | 3.7 s | 0.27 – 0.30 s | 507 ms | 0 | 341 KB |

Same picture as `/login`: CLS and the JavaScript weight are within budget, the page paints its largest element
at first paint, and the simulated LCP and TBT miss (TBT varies 387 – 1259 ms between runs on this machine).

**Not yet met in this local lab**: LCP and TBT on these pages. Whether the real catalog, product and cart pages
meet them is the first nightly run's verdict; if they don't, the next levers are (in order) moving
interactive-only shell parts (account menu, phone drawer, toasts) to load after first paint, checking the
Radix share per page, and React/Next.js settings for hydration.

## 4. Requests, polling and the backend's rate limits

Polling runs only while a tab is visible (TanStack pauses intervals in the background); queries also refetch
on window focus (default) and when stale.

From Release 2 a realtime message refreshes what a screen shows, and the timed polls below run **only while the
tab has no socket** (CLAUDE.md §5, design 01 R-59); with a socket the steady cost is 0 requests per minute plus one
refetch per relevant message. Release 2 values (T-O3, from the code):

| App / screen | Requests while open, without a socket | Source |
|---|---|---|
| Admin dashboard | none: figures stale after 60 s, "Refresh" by hand; refreshed by `support.ticket_updated` / `return.updated` | spec 03 AD-02 (AD-Q-16) |
| Seller orders list / overview queues, return queues | 1 per minute each (60 s) | spec 02 SE-06, SE-14, SE-18 |
| Seller order detail (not final) | 1 per minute | spec 02 SE-15 |
| Agent active shipments | 2 per minute (30 s) | spec 04 AG-04 |
| Customer order awaiting card payment | 2 per minute (30 s) | spec 01 SF-18 |
| Card payment return | waits 30 s for `payment.updated`, then 12 per minute (5 s); ends at a final state or 2 min after the window | spec 01 SF-09 (v1.2) |
| Notification unread count (every signed-in page) | 1 per minute (60 s) | design 02 §5 (`notifications.unreadCount`) |
| Open support thread | 6 per minute (10 s) | design 02 §5 (`support.messages`) |
| Image being processed (per upload) | 1 s, doubling to 30 s, until ready or failed (visible tab only) | design 01 §15.4 |
| Session refresh | 1 per access-token lifetime (15 min) per signed-in tab group | design 01 §5 |
| Socket handshake | 1 `POST /api/auth/realtime-token` per connect (open, reconnect, `token_expired`); closed after 5 min hidden | design 01 §15.3 |

Backend limits (development defaults; production values are set by operations), keyed as shown [VERIFIED backend
`rate-limit.ts` and routes]:

| Class | Default | Key | What it means behind the BFF |
|---|---|---|---|
| General | 600 / 60 s | client IP | every request of every user of one app server shares it: e.g. 120 open admin dashboards, or ≈ 150 storefront page views per minute (each server-rendered page makes several backend calls) |
| Strict auth (sign-in, register, verify, reset) | 10 / 300 s | client IP **and** the email (two counters) | the IP counter is shared: **2 sign-ins per minute for a whole app** |
| Refresh (and logout) | 30 / 300 s | client IP | ≈ 90 concurrently active users per app before refreshes start failing |
| Checkout | 10 / 60 s | the signed-in user | per customer: not affected by the shared IP |

Conclusion: the polling itself is modest per user. The limiting factor is that the backend counts every
browser request's general, refresh and sign-in IP counters against the **BFF server's IP** (open item **OQ-1**, already marked as blocking production): with
the current keying, a handful of users exhausts the strict-auth and refresh limits. No frontend change fixes
this; OQ-1's recommendation (a trusted client-IP header with a shared secret, honoured by the backend for rate-limit
keys only) remains the requirement before launch.

## 5. Release 2 (T-O3)

### 5.1 Socket client off the critical path

`socket.io-client` was imported statically by `@nile/realtime`, so every page that mounts the realtime provider
(all of them, in every app) loaded it with the first paint, also for signed-out visitors who never connect.
`createRealtimeConnection` now imports it on the first connect (`import('socket.io-client')` in the default
`createSocket`); Turbopack puts it in its own chunk, which no page lists up front. A failed load of that chunk is
retried with the reconnect back-off; `stop()` while it loads never connects. Tests: `connection.test.ts`
("the client loaded on first connect").

Storefront production build, gzipped JavaScript the page lists up front (build manifest root files plus the page's
client reference manifest; this over-counts against Lighthouse's "transferred" because the manifest lists every
client module of the route segment, so compare the two columns, not with §3):

| Page | Static import | Loaded on first connect | Difference |
|---|---|---|---|
| `/`, `/p/[idOrSlug]`, `/cart` | 399.3 KB | 387.1 KB | −12.2 KB |
| `/login` | 406.0 KB | 393.8 KB | −12.2 KB |

The client chunk itself: 41.2 KB raw, 12.7 KB gzipped, downloaded once per tab when a signed-in user connects.

### 5.2 The LCP image

| Page | Image loaded eagerly with `fetchpriority=high` | Test |
|---|---|---|
| Product (`/p/…`) | the main photo | `product-view.test.tsx` |
| Category and search listings | the first row (`FIRST_ROW_CARDS` = 3) | `product-browser.test.tsx` |
| Home | the first phone row of "Shop by category" (`PRIORITY_TILES` = 2; was lazy before T-O3) | `catalog-navigation.test.tsx` |
| Cart | none: thumbnails are small; the LCP element is text | — |

Every other image is `loading="lazy"`; every `NileImage` has intrinsic `width` / `height`, so images can't
shift the layout (CLS).

### 5.3 Budgets with real images

To run in the phase o lab session (CLAUDE.md §14.1bz TO-Q1): `npm run perf` against the local backend with
the realistic seed (seller product images and category images uploaded to MinIO). Acceptance (TO-Q3): CLS < 0.1
with images, the LCP image prioritised (5.2), JavaScript on the budgeted pages not above R1's 341 KB
transferred; LCP and TBT recorded against their budgets, not blocking.

| Page | FCP | LCP (simulated) | TBT | CLS | JS transferred |
|---|---|---|---|---|---|
| `/` | | | | | |
| `/c/[slug]` | | | | | |
| `/p/[slug]` | | | | | |
| `/cart` (signed in) | | | | | |
