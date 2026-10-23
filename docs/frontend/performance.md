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

**Not yet met in this local lab**: LCP and TBT on these pages. Whether the real catalog, product and cart pages
meet them is the first nightly run's verdict; if they don't, the next levers are (in order) moving
interactive-only shell parts (account menu, phone drawer, toasts) to load after first paint, checking the
Radix share per page, and React/Next.js settings for hydration.

## 4. Requests, polling and the backend's rate limits

Polling runs only while a tab is visible (TanStack pauses intervals in the background); queries also refetch
on window focus (default) and when stale.

| App / screen | Requests while open | Source |
|---|---|---|
| Admin dashboard | 5 per minute (5 queues, 60 s) | spec 03 AD-02 |
| Seller orders list / overview | 1 per minute each (60 s) | spec 02 SE-14 |
| Seller order detail (not final) | 1 per minute | spec 02 SE-15 |
| Agent active shipments | 2 per minute (30 s) | spec 04 AG-04 |
| Customer order awaiting card payment | 2 per minute (30 s) | spec 01 SF-18 |
| Card payment return | 20 per minute (3 s), ends at a final state or 2 min after the window | spec 01 SF-09 |
| Session refresh | 1 per access-token lifetime (15 min) per signed-in tab group | design 01 §5 |

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
