# Frontend Architecture — Nile Marketplace Web

Status: **DRAFT v0.2 (2026-10-14).** v0.1: proposal. v0.2: your answers to FQ-1…FQ-11 applied (§11); the rest of this document is still a proposal until you approve it. Labels as in `api-inventory.md` §0. **[DELEGATED]** marks a decision you asked me to make by applying my recommendation; any of them can be overturned. Concrete modules, interfaces and flows are in `docs/frontend/design/`; its refinements of this document are listed in `design/01-system-design.md` §13.

Fixed by you (Task 001): Next.js (App Router) · React · TypeScript · Tailwind CSS · shadcn/ui · TanStack Query · Zod · React Hook Form · the web app split per user role · the phase order a–i.
Fixed by the backend: it is the source of truth for business rules, permissions, validation, pricing, stock, orders and payments. The frontend does not change it.

---

## 1. Principles

1. **The backend decides; the UI presents.** No business rule is re-implemented as a source of truth. Client-side validation mirrors backend DTO rules for fast feedback only; the server's `VALIDATION_FAILED` details always win and are mapped back onto the form.
2. **Tokens never reach browser JavaScript.** (§5)
3. **One typed contract** generated from the backend's OpenAPI document, corrected for its known defects, checked for drift in CI (§6).
4. **Server state lives in TanStack Query, URL state in the URL, form state in React Hook Form.** No global client store unless a real need appears.
5. **Least privilege per role:** each role's UI can only reach the backend paths that role is allowed to call (§5.5).
6. **Small, reviewable increments**, each with tests and a definition of done (`implementation-plan.md`).

## 2. System context

```
                ┌──────────────────────── Next.js app(s) (Node runtime) ───────────────────────┐
 Browser ──────►│ proxy.ts (optimistic route guard, CSP nonce, security headers)               │
 (no tokens)    │ Server Components ── DAL (session → access token) ──┐                        │
   cookie:      │ Route Handlers  /api/auth/*  (login, refresh, logout, …)                     │
   __Host-…     │ Route Handler   /api/bff/[...path]  (allow-listed proxy, adds Bearer)  ──────┼──► Nile API /api/v1
   (encrypted   │ Server Actions (optional, same DAL)                                          │    (Bearer only,
   session)     └──────────────────────────────────────────────────────────────────────────────┘     no cookies)
                         ▲  Kashier hosted payment page redirects the shopper back (OQ-2)
```

The Next.js server acts as a **Backend-for-Frontend (BFF)** for authentication only: it holds the backend tokens in an encrypted, httpOnly cookie and forwards calls. It holds no business logic and no database.

## 3. Splitting the app per role (FQ-1)

You asked to split the web app by user role. **Decided (2026-10-14): option A**, with all four apps (`storefront`, `seller`, `admin`, `agent`; FQ-2 = yes). The comparison is kept for the reasoning.

| | **A. Monorepo, one Next.js app per role (Rec)** | B. One Next.js app, one route group per role |
|---|---|---|
| Layout | `apps/storefront` (visitor + customer), `apps/seller`, `apps/admin`, `apps/agent` (FQ-2) + shared `packages/*` | `app/(shop)`, `app/seller`, `app/admin`, `app/agent` in one app |
| Isolation | Separate origins (e.g. `admin.<domain>`): separate session cookies, CSP, deploys; admin can be network-restricted; a bug in one app can't leak another role's pages | One origin, one cookie, one deploy; isolation by route guards only |
| Bundle | Each app ships only its role's code | Route-level code splitting already isolates bundles reasonably |
| Cost | Workspace tooling, 3–4 deploy targets, shared packages to version | Simplest to start and to run |
| Fit with backend | Matches "one role per account" (a user never needs two roles in one session) | Same |

Shared packages in A (no React in `api`/`domain`, so they are testable in isolation):

| Package | Contents |
|---|---|
| `packages/api` | OpenAPI snapshot, generated types, typed client, `ApiError`, envelope unwrapping, error-code catalogue, query-param builders |
| `packages/auth` | Session cookie crypto, BFF route-handler factories (login/refresh/logout/proxy), DAL helpers, client refresh coordinator |
| `packages/domain` | Money (decimal), dates, enum labels, display-only status helpers, shared Zod field schemas (email, phone, money, password, OTP) |
| `packages/ui` | shadcn/ui components, design tokens, Tailwind theme, layout primitives, data-table with cursor pagination |
| `packages/config` | tsconfig, ESLint, Prettier, Vitest presets |
| `packages/test-utils` | MSW handlers, typed fixtures/factories, render helpers |

Workspace tool: **npm workspaces** (same package manager as the backend, CLAUDE.md D15). Turborepo for task caching is optional (new dependency, FQ-9).

## 4. Routing and role landing

| App | Public routes | Authenticated routes (role) |
|---|---|---|
| storefront | `/`, `/c/[slug]` (category), `/p/[slug]` (product), `/search`, `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/invite` (neutral invite landing for admins and agents, §5.7) | `/cart`, `/checkout`, `/checkout/payment-return` (OQ-2), `/account`, `/account/addresses`, `/account/orders`, `/account/orders/[id]`, `/account/security` (customer) |
| seller | `/login`, `/register`, `/verify-email`, password reset | `/` (status + overview), `/products`, `/products/[id]`, `/orders`, `/orders/[id]`, `/finance`, `/profile` (seller) |
| admin | `/login`, password reset | sellers, catalog, governorates & delivery settings, agents, shipments, orders, refunds, finance, admins (admin) |
| agent | `/login`, password reset | `/` (shift + active shipments), `/shipments/[id]`, `/history`, `/finance` (delivery_agent). Mobile-first layout |

- Login is role-agnostic at the API. Each app's login handler **rejects a token whose `user.role` doesn't belong to that app** (it logs the session out again and shows "use the seller/admin/… site"), so a seller can never hold a session in the admin app.
- English only, no locale prefix in URLs (FQ-4). Route URLs are proposals until the business spec fixes them.

## 5. Authentication and session (recommended strategy)

### 5.1 Why a BFF and not tokens in the browser

The backend contract is Bearer-only with the refresh token in the request body, designed for a mobile app's secure storage [VERIFIED]. A browser has no equivalent: `localStorage`/`sessionStorage` and JS memory are readable by any injected script, and a 30-day refresh token stolen by XSS is a 30-day account takeover. Keeping both tokens server-side in an httpOnly cookie reduces XSS impact to "act while the page is open" and costs one hop. This does **not** weaken backend auth: the backend still validates every request; the cookie exists only between the browser and our own Next.js server.

The trade-offs it introduces, and how they are handled:

| Trade-off | Handling |
|---|---|
| Cookies bring CSRF | §5.6 |
| Backend sees the BFF's IP for every user → shared rate limits | **Blocker OQ-1**, needs a backend decision before production. Local development is unaffected |
| Rotation with reuse detection and no grace window | §5.3 |
| An extra network hop | Same region deployment; SSR calls go server→API directly |

Alternative (not recommended): browser calls the API directly with an in-memory access token and the refresh token in an httpOnly cookie set by a small BFF endpoint. It still needs the BFF for refresh (so OQ-1 still applies to login/refresh) and adds CORS configuration (OQ-4). No advantage over the full BFF.

### 5.2 Session cookie

- One cookie per app origin: `__Host-nile_<app>_session` — `HttpOnly; Secure; Path=/; SameSite=Lax`; `Max-Age` = refresh-token expiry.
- Value: **encrypted and authenticated** (JWE, `dir` + `A256GCM`, via `jose`) containing `{ accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt, user: { id, email, role, status } }`. Key from a server-only env var, with a key id so it can be rotated (mirrors the backend's key-ring approach). Never logged.
- `SameSite=Lax`, not `Strict`: the shopper returns from Kashier with a top-level cross-site navigation and must still be logged in on the return page [ASSUMPTION about Kashier's redirect being a top-level GET; verify in T-F4].
- A second, **non-sensitive** readable cookie `nile_<app>_sv` holds only the access-token expiry time (a session "version"), so tabs can tell whether a refresh is still needed without seeing any token.

### 5.3 Refresh: serialised per browser, executed by the server

Facts that constrain this [SPEC 03]: rotating refresh tokens, reuse revokes the family, no grace window, refresh must be serialised. Server Components cannot set cookies (only Route Handlers, Server Actions and `proxy.ts` can), and `proxy.ts` runs for prefetches in parallel, so refreshing there would race.

Design:
1. **Only one code path refreshes:** `POST /api/auth/refresh` (Route Handler). It reads the session, and if the access token is still valid for more than a skew (e.g. 60 s) it returns `200` **without** calling the backend. Otherwise it calls `POST /auth/refresh`, writes the new cookie and returns the new expiry.
2. **The browser serialises calls to it across tabs** with the Web Locks API (`navigator.locks.request('nile-<app>-refresh', …)`). After acquiring the lock a tab re-reads `nile_<app>_sv`; if another tab already refreshed, it skips. Fallback where Web Locks is unavailable: an in-tab single-flight promise plus a `BroadcastChannel` notice (a residual cross-tab race is then possible; acceptable on such browsers, which are rare).
3. **Client-side calls** (TanStack Query → `/api/bff/*`): on `401 UNAUTHENTICATED` the client runs step 2, then retries the original request **once**. `INVALID_REFRESH_TOKEN` → session ended → clear cache, go to login.
4. **Server Components never refresh.** If the session's access token is expired when a page renders, the page renders a small client boundary that runs step 2 and then `router.refresh()`. Proactively, a client timer refreshes shortly before expiry while the tab is visible, so most navigations never meet an expired token.
5. Different browsers/devices hold different token families, so per-browser serialisation is sufficient; no shared store (Redis) is needed on the frontend side. If FQ-1 B or several replicas behind one domain are chosen, this still holds because the lock lives in the browser, not on the server.
6. Logout: `POST /api/auth/logout` → backend `POST /auth/logout` with the refresh token → clear cookie → `BroadcastChannel` tells other tabs to drop their query cache and navigate to login.

### 5.4 Client IP forwarding (depends on OQ-1)

The BFF forwards `X-Correlation-Id` (generated per request, logged on both sides) and, **if the backend adopts a trusted mechanism**, the end-user IP. Until OQ-1 is settled, the BFF must not set `X-Forwarded-For` expecting the backend to trust it; with `TRUST_PROXY_HOPS` > 0 the backend would also trust a forged header from mobile clients, which weakens its rate limiting.

### 5.5 Authorization layers (defence in depth)

| Layer | Check | Authority |
|---|---|---|
| `proxy.ts` | Session cookie present and `user.role` matches the app → otherwise redirect to login. Optimistic: no network call | UX only |
| DAL (`requireSession(role)`), called by every protected Server Component, Server Action and Route Handler | Decrypts the session, checks role and expiry; never trusts client input for identity | Frontend gate |
| BFF proxy allow-list | Each app proxies only its role's path prefixes (storefront: `/me`, `/cart`, `/checkout`, `/orders`, public catalog; seller: `/seller/*`; admin: `/admin/*`; agent: `/agent/*`; all: needed `/auth/*`) and only the documented methods | Least privilege |
| Backend | Role guard, ownership checks, business-status guards | **Final** |

Business-status gating in the UI (seller not approved, agent inactive) is read from the profile endpoints and used only to hide/disable actions with an explanation; the backend errors (`SELLER_NOT_APPROVED`, `AGENT_INACTIVE`) are still handled.

### 5.6 CSRF and other session hardening

- `SameSite=Lax` blocks cross-site `POST` with the cookie in modern browsers.
- Every mutating BFF route additionally requires (a) `Origin` equal to the app's own origin and (b) a custom header (`X-Nile-Client: 1`) that a cross-site form cannot send. Server Actions already compare `Origin` with `Host`; they also get explicit auth checks, because an exported Server Action is a public endpoint.
- Login, register and password routes are only `POST` Route Handlers; no state change on `GET`.
- After login, the session cookie is always newly issued (no fixation).
- `Cache-Control: no-store` on every authenticated response and BFF route.

### 5.7 Invite acceptance with one invite URL and separate apps [DELEGATED, resolves OQ-3 without a backend change]

Facts [VERIFIED]: the backend builds every invite link as `INVITE_URL_BASE?token=<43 chars>`, one URL for admins **and** delivery agents; the email names the role but the link doesn't. With one app per role (FQ-1 A) the link can't land directly in the right app.

Design:
1. `INVITE_URL_BASE` = `<storefront origin>/invite` (the only public origin every invitee can reach; set in the backend's env, no code change).
2. The page reads `token`, removes it from the address bar, and asks for the new password.
3. `POST /api/auth/invite` (storefront Route Handler) calls `POST /auth/invite/accept`, reads `user.role` from the response, **immediately** calls `POST /auth/logout` with the returned refresh token, and **sets no cookie**. Tokens exist only inside that one server request.
4. The handler answers with the role only; the page redirects to that app's `/login?invited=1&email=<email>` ("Password set, sign in").
5. A role other than `admin` / `delivery_agent` (impossible today) → generic error, session already discarded.

Cost: the invitee signs in once more. Alternative (backend change, not needed now): a per-role invite URL. The email text says "Open this link on your phone"; it still works on desktop, but the copy is mobile-oriented (backend owner's call).

## 6. API client and type generation

### 6.1 Pipeline

```
backend (docker compose) ──GET /api/v1/docs/openapi.json──► packages/api/openapi/nile.openapi.json  (committed snapshot)
                                     │  scripts/openapi-fix.ts (deterministic corrections, §6.3)
                                     ▼
                         openapi-typescript ──► packages/api/src/generated/schema.d.ts (committed, never edited)
                                     ▼
          openapi-fetch typed client + our wrapper (envelope, errors, idempotency, correlation id)
                                     ▼
          features/*/api.ts: queryOptions() / mutation hooks for TanStack Query
```

- `npm run api:pull` fetches the snapshot from a running backend (URL from env, never hard-coded); `npm run api:gen` regenerates types. CI runs `api:gen` and fails if the committed output differs (drift check). A backend upgrade is a reviewed PR that updates the snapshot.

### 6.2 Tool choice (recommendation, needs approval)

| Option | For | Against | Verdict |
|---|---|---|---|
| **`openapi-typescript` + `openapi-fetch`** | Types only, ~6 KB runtime, keyed by **path + method** (immune to the missing `operationId`s, OA-2), easy to post-process the input | Query hooks and Zod written by hand | **Rec** |
| Orval | Generates TanStack Query hooks and Zod in one config | Hook names derived from paths (no operationIds) and churn; generated Zod inherits the nullability defect (OA-1) and would reject valid responses | Not now |
| `@hey-api/openapi-ts` | Active, plugin for TanStack Query | Same naming and nullability issues; heavier | Not now |

### 6.3 Correcting the OpenAPI defects before generation

`scripts/openapi-fix.ts` applies a reviewed, unit-tested list of corrections to the snapshot (input stays untouched in git; the fixed copy is generated):

| Defect | Correction |
|---|---|
| OA-1 nullable fields documented as optional | For **response** schemas: every property not in `required[]` becomes `T \| null` and is added to `required[]`. [ASSUMPTION: backend response DTOs always emit every key, using `null` for "no value". Proved or disproved by the contract tests in T-B7 before anything relies on it.] For **request** schemas: explicit list of `opt nullable` fields from the backend spec (`floor`, `apartment`, `landmark`, `compareAtPrice`, `parentId`, `deliveryFee`, …) |
| OA-4 `idOrSlug` typed uuid | Drop the `format` |
| OA-5 `__atLeastOneField` | Remove the property |
| OA-6 `UpdateGovernorateDto.deliveryFee` | Mark required + nullable |
| OA-7 `attr.{code}[in]` | Removed from generated params; a hand-written `buildProductQuery()` handles attribute filters |

Each correction is also reported to the backend owner, since fixing them at the source (class-validator-jsonschema `nullable`, `operationId`s, per-status error schemas) removes the script.

### 6.4 Client wrapper (in `packages/api`)

- Unwraps `{ success, data, meta }` and returns `{ data, meta }`; converts every error envelope into an `ApiError { status, code, message, details, correlationId, retryAfter? }`. Non-JSON or network failures become `ApiError` with `code: 'NETWORK_ERROR'`.
- `code` is typed as a union from the hand-maintained catalogue (`api-inventory.md` §7) plus `string` for forward compatibility.
- Idempotency: mutations that require it take an explicit `idempotencyKey` argument; the hook creates it with `crypto.randomUUID()` when the user starts the action and keeps it until success or a deliberate new attempt.
- Every request sends a fresh `X-Correlation-Id`; it is shown in error toasts ("reference: …") for support.
- Query strings are built literally (`createdAt[gte]=…`), matching the backend's simple query parser.
- Two transports, one API: server-side (DAL attaches `Authorization`) and browser-side (calls `/api/bff/<path>` and never sees a token).

### 6.5 TanStack Query conventions

- **Per-request `QueryClient` on the server**, singleton in the browser (`getQueryClient()` helper). Never a module-level server client (cross-user leak).
- Query keys from one factory per resource: `['products', 'list', params]`, `['orders', 'detail', id]`. `queryOptions()` objects live next to the feature and are reused by server prefetch, `useQuery`, `useSuspenseQuery` and invalidation.
- Server prefetch + `HydrationBoundary` for pages that should render with data (storefront catalog, order detail). Authenticated portal pages may fetch client-side only.
- Lists use `useInfiniteQuery` with `getNextPageParam: (last) => last.meta.hasMore ? last.meta.nextCursor : undefined`.
- Defaults: `staleTime` 30 s for catalog, 0 for cart/order/stock views; `retry` only for network errors and `5xx` on **queries**, never on mutations except idempotent ones re-sent with the same key; `refetchOnWindowFocus` on for portal lists. Polling intervals for seller orders and agent shipments: OQ-13.
- Mutations update the cache from the response when the API returns the new resource (most do: cart returns `CartDto`, seller actions return `SellerOrderDto`), otherwise invalidate precise keys.
- Query cache is cleared on logout and on a role change.

### 6.6 Forms: Zod + React Hook Form

- One Zod schema per form, built from shared field schemas (`email`, `egPhone`, `money`, `password` with a 72-byte UTF-8 check, `otp`, `slug`) that mirror backend DTO rules, and typed with `satisfies` against the generated request type so drift fails compilation.
- Strings are trimmed like the backend (`str` fields) except passwords (never trimmed).
- Submit sends **only** the DTO fields (strict backend whitelist); PATCH sends only changed fields and never an empty body.
- Server `VALIDATION_FAILED` details are mapped to `setError(field)`; dotted/array paths map to RHF paths; unmatched → form-level alert.
- shadcn/ui `Field`-style components wrap RHF `Controller`; labels, descriptions and error messages are wired with `aria-*` for accessibility.

## 7. Rendering and caching per area

| Area | Rendering | Next.js caching |
|---|---|---|
| Catalog pages (public) | Server Components, streaming, SEO metadata (title, description, canonical URL, Open Graph text-only). Filters in the URL [DELEGATED FQ-7: SEO matters → server-rendered] | Category tree: revalidate ~5 min (backend caches 1 h). Listings and product detail: no Next cache (stock and visibility are live) |
| Cart, checkout, account | Server shell + client components; data via TanStack Query through the BFF | `no-store` |
| Seller, admin, agent portals | Server-rendered layout and auth gate, client-side data views | `no-store` |

No authenticated response is ever stored in a shared cache.

## 8. Cross-cutting concerns

- **Money:** values stay strings end to end; arithmetic (only `expectedTotal`) uses a decimal library (`decimal.js`, same as the backend, or `big.js`; new dependency); formatting with `Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP' })`.
- **Dates:** ISO strings from the API, displayed with `Intl.DateTimeFormat('en-EG')` in the `Africa/Cairo` time zone [DELEGATED]. Countdowns (accept deadline, payment window, OTP cooldown) use server timestamps, not the client clock alone.
- **Language:** English only, `lang="en"`, `dir="ltr"` (FQ-4, decided). No i18n library. Copy for enum values and error codes is still centralised (`packages/domain/labels`, error-code → message map), never scattered string literals, so a second language stays possible. Using Tailwind logical properties (`ms-`, `pe-`) is encouraged but not required.
- **Money format:** `Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' })` [DELEGATED].
- **Enum labels:** one map per enum in `packages/domain`, exhaustive (`satisfies Record<Enum, string>`), so a new backend value fails type-checking.
- **Status-driven actions:** display helpers (`sellerOrderActions(status)`) only decide which buttons to show; the API remains the judge.
- **Text content:** product descriptions are plain text (≤ 5000 chars): render as text with preserved line breaks, never as HTML.
- **Errors:** route-level `error.tsx` and `not-found.tsx` per segment; a toast system for mutation errors with the correlation id; `404` from the API on owned resources shows "not found" (never "forbidden").
- **Observability:** structured server logs with correlation ids; error monitoring service is FQ-10.
- **Accessibility:** WCAG 2.2 AA target; keyboard-complete flows; shadcn/Radix primitives; axe checks in tests.
- **Performance:** RSC by default, `"use client"` only for interactive leaves; route-level code splitting; Core Web Vitals budgets set in phase i.

## 9. Security guidelines (binding once approved)

1. Run a patched Next.js release (at least the October 2026 security release, 16.4.1 on the 16.x line) and keep it patched; `npm audit` in CI.
2. CSP with per-request nonces from `proxy.ts`; no `unsafe-inline` scripts; `frame-ancestors 'none'`; HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
3. No `dangerouslySetInnerHTML` with API data. No user-provided URLs rendered as links without scheme validation (the Kashier `checkoutUrl` is used only for `window.location.assign` after checking it is `https:`).
4. Server-only modules import `server-only`; env vars split into a server schema and a public schema (zod-validated at startup, no defaults, mirroring the backend rule); only `NEXT_PUBLIC_*` values reach the browser and none are secrets.
5. Secrets (session encryption keys) come from the deployment's secret store, never from the repo. `.env*` files are git-ignored; `.env.example` lists keys only.
6. Never log tokens, cookies, passwords, OTPs, invite tokens or full addresses/phones.
7. The invite token and OTPs are never stored client-side beyond the form; the invite page removes the token from the URL (`history.replaceState`) after reading it.
8. Server Actions and BFF routes validate input with Zod and call `requireSession(role)` first.
9. No feature is hidden "for security" only in the UI; anything sensitive is enforced by the backend.

## 10. Coding guidelines

- TypeScript `strict` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` (helps keep `null` vs absent honest), `useUnknownInCatchVariables`. No `any`; no non-null `!` on data.
- ESLint: `next/core-web-vitals`, `typescript-eslint` strict-type-checked, `react-hooks`, `jsx-a11y`, `@tanstack/eslint-plugin-query`, import boundaries (apps → packages; `packages/api` and `domain` never import React or Next; features never import another feature's internals). Prettier.
- Feature folders: `features/<feature>/{api.ts, components/, schemas.ts, hooks.ts, lib/}`; a feature exposes an `index.ts`.
- Server Components by default; a `"use client"` file is a leaf with a reason.
- No magic strings: route paths, query keys, header names, cookie names, enum labels are constants.
- Components get data through props or `queryOptions`, never by calling `fetch` directly.
- File naming `kebab-case.tsx`; components `PascalCase`; hooks `useX`.
- Every bug fix comes with a regression test.

## 10a. Folder structure (for option A of FQ-1)

```
nile-marketplace2-frontend/
  apps/
    storefront/                 # visitor + customer
      src/
        app/
          (shop)/               # /, /c/[slug], /p/[slug], /search
          (auth)/               # /login, /register, /verify-email, /forgot-password, /reset-password
          account/              # profile, addresses, orders, security (customer)
          cart/  checkout/      # incl. checkout/payment-return
          api/auth/[action]/route.ts   # login | refresh | logout | … (from packages/auth)
          api/bff/[...path]/route.ts   # allow-listed proxy (from packages/auth)
          layout.tsx  error.tsx  not-found.tsx
        features/               # catalog/, cart/, checkout/, orders/, account/, auth/
          <feature>/{index.ts, api.ts, components/, schemas.ts, hooks.ts, lib/}
        lib/                    # env.ts (zod), dal.ts (server-only), query-client.ts
        proxy.ts
      next.config.ts  tsconfig.json  .env.example
    seller/   admin/   agent/   # same skeleton, role-specific features
  packages/
    api/        { openapi/nile.openapi.json, scripts/openapi-fix.ts, src/generated/schema.d.ts, src/client.ts, src/errors.ts, src/query.ts }
    auth/       { src/session.ts, src/route-handlers.ts, src/proxy-allowlist.ts, src/dal.ts, src/client/refresh-coordinator.ts }
    domain/     { src/money.ts, src/dates.ts, src/labels/, src/status/, src/zod-fields.ts }
    ui/         { src/components/ (shadcn), src/data-table/, src/theme.css, src/icons.ts }
    config/     { tsconfig/, eslint/, prettier/, vitest/ }
    test-utils/ { src/msw/, src/factories/, src/render.tsx }
  e2e/          # Playwright, one folder per role journey, runs against the real backend
  docs/frontend/
  package.json  (npm workspaces)  .nvmrc (Node 24, as the backend)  .github/workflows/ci.yml
```

For option B the same `features/`, `lib/` and `packages/*` split applies inside one app, with `app/(shop)`, `app/seller`, `app/admin`, `app/agent` route groups.

## 10b. Testing strategy

| Level | Tool | What it covers | Runs |
|---|---|---|---|
| Static | `tsc --noEmit`, ESLint, Prettier, OpenAPI drift check | Types against the contract, boundaries, a11y lint | every PR |
| Unit | Vitest | `packages/api` (envelope, `ApiError`, query builders, openapi-fix), `packages/domain` (money, labels exhaustiveness, Zod field schemas vs. backend rules), `packages/auth` (session crypto, refresh coordinator with fake locks/timers, allow-list) | every PR |
| Component | Vitest + Testing Library + MSW + `user-event` (jsdom) | Forms (validation, server error mapping, idempotency key reuse), lists (cursor paging, empty/error/loading states), status-driven actions, role gating | every PR |
| Contract | Vitest against a real backend from the backend repo's `docker compose` (+ `npm run seed:dev`) | Generated types and the OA-1 assumption hold at runtime: every documented response is parsed by a strict Zod schema derived from the fixed snapshot; error envelopes per common code | every PR touching `packages/api`, nightly otherwise |
| E2E | Playwright (Chromium + WebKit + a mobile viewport), `@axe-core/playwright` | Per-role journeys from `workflows.md` against the real backend with the fake payment gateway (`PAYMENT_GATEWAY=fake`, signed webhooks via the backend's `dev:kashier-webhook`) and Mailpit for OTP/invite emails | PR (smoke set), nightly (full) |
| Security | `npm audit`, header/CSP assertions in E2E, auth abuse tests (CSRF origin check, cross-app session rejection, tab-race refresh) | | PR + nightly |
| Performance | Lighthouse CI on storefront pages | Web Vitals budgets (phase i) | nightly |

Rules: every new screen ships with component tests for its happy path, validation failure, server error mapping and authorization state; every workflow in `workflows.md` gets at least one E2E test by the end of its phase; MSW handlers are typed from the generated schema so mocks cannot drift silently. The user's environment has the Postman CLI; the backend's Postman collection (`docs/postman/`) can serve as an additional smoke check of the backend before E2E runs (optional).

## 11. Decisions log (frontend questions)

### 11.1 Decided (2026-10-14)

| Id | Question | Decision | By |
|---|---|---|---|
| FQ-1 | Shape of the per-role split | **A**: npm-workspaces monorepo, one Next.js app per role + shared packages (§3) | you |
| FQ-2 | Delivery agent web UI | **Yes**: `apps/agent`, mobile-first (T-H12 in scope) | you |
| FQ-4 | Languages, direction, time zone | **English only**, LTR, no i18n library. Display time zone `Africa/Cairo`, money `en-EG` EGP | you (language) / DELEGATED (zone, formats) |
| FQ-5 | Visual design input | I propose a token set and core components in phase c (T-C1) for your approval before screens are built | DELEGATED |
| FQ-6 | Anonymous add to cart | **Login required at "Add to cart"**, then return to the same product with the chosen variant preselected (no client-side cart copy) | you |
| FQ-7 | SEO for catalog | Important: catalog server-rendered (§7) | DELEGATED |
| FQ-9 | New dependencies | Approved set: `openapi-typescript`, `openapi-fetch`, `jose`, `decimal.js`, `server-only`, `msw`, `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `@playwright/test`, `@axe-core/playwright`, `@tanstack/eslint-plugin-query`, `eslint-plugin-jsx-a11y`, `@tanstack/react-query-devtools` (dev only). **Not** adopted: Turborepo (npm workspaces suffice for four apps; revisit if CI gets slow), `next-intl` (English only), Storybook (component tests + a token page cover it). Any other new dependency still needs your approval | DELEGATED |
| FQ-10 | Error monitoring | Structured server logs with correlation ids until hosting is chosen; pick a monitoring service in phase i together with FQ-3 | DELEGATED |
| FQ-11 | Repository | This folder becomes its own git repo, branch `main`, created in T-B1 (not now: no scaffolding before the spec is approved) | DELEGATED |

### 11.2 Deferred

| Id | Question | Status |
|---|---|---|
| FQ-3 | Hosting for staging/production | **Deferred by you.** Everything stays host-agnostic: Node runtime, `output: 'standalone'` builds runnable in a container, no platform-specific APIs. Blocks T-I5 only. Note: OQ-1's fix depends on how the BFF reaches the backend |
| FQ-8 | Domains | Deferred with FQ-3. Local development uses `localhost` ports (implementation-plan T-B1). Blocks real values for `INVITE_URL_BASE` and `KASHIER_REDIRECT_URL` in staging |

Backend-side questions (OQ-1 … OQ-15) and my recommendation for each are in `api-inventory.md` §10. OQ-1 (client IP behind a BFF) still blocks a production launch.
