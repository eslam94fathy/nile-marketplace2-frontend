# Implementation Plan — Nile Marketplace Web

Status: **DRAFT v0.2 (2026-10-14), PROPOSED.** v0.2: FQ decisions applied (architecture §11): monorepo with four apps, English only, login required to add to cart, hosting deferred. No task starts before the business spec and system design are approved. File paths follow `architecture.md` §10a.

## 0. How to read this plan

- Phases follow your order: **a** Discovery · **b** Foundation · **c** Design System · **d** Authentication · **e** Catalog · **f** Cart & Checkout · **g** Orders & Account · **h** Seller & Admin & Agent · **i** Hardening & Release.
- Each task is one reviewable PR (or a small stack). Ids: `T-<phase><n>`.
- Every task follows the order you set for the backend: spec/plan approved → code → tests → review.
- "Workflow" references point to `workflows.md`; "OQ/FQ" to the open questions in `api-inventory.md` §10 and `architecture.md` §11.

### 0.1 Definition of Done (applies to every task, in addition to its own)

1. Acceptance criteria met and demonstrated (screenshot or short recording for UI tasks).
2. `typecheck`, `lint`, `format:check`, unit/component tests and the OpenAPI drift check are green in CI; E2E smoke green from phase d on.
3. No `any`, no disabled lint rules without a comment explaining why.
4. No secrets, tokens or PII in code, fixtures, logs or screenshots.
5. Loading, empty, error and unauthorized states exist for every new screen.
6. Keyboard and screen-reader basics verified (axe: no serious/critical violations) for every new screen.
7. Docs updated (`docs/frontend/*`) when a decision, contract or workflow changed.
8. No backend file changed. A needed backend change is raised as a question, not worked around.

## Phase a — API Discovery

### T-A1 Discovery deliverables (this task)
- **Scope:** `api-inventory.md`, `architecture.md`, `workflows.md`, `implementation-plan.md`.
- **Exclusions:** any code, scaffolding, dependency install.
- **Dependencies:** none.
- **Files:** `docs/frontend/*.md`.
- **Acceptance criteria:** every one of the 123 operations is listed; verified facts, assumptions and open questions are labelled; open questions have options and a recommendation.
- **Tests:** n/a (document review).
- **DoD:** you approve the documents and answer (or defer with a default) FQ-1…FQ-11; OQ-1…OQ-15 are forwarded to the backend owner where needed.

## Phase b — Frontend Foundation

### T-B1 Repository and workspace scaffold
- **Status (2026-10-14):** implemented, verified locally from a clean `npm ci` (lint, format, type-check, 18 tests, build of 4 apps, audit gate, dev servers on 4100–4103); awaiting review and first CI run on GitHub. Versions and deviations: `CLAUDE.md` §1, §14.3 TB-1, TB-2.
- **Scope:** git repo (FQ-11), npm workspaces, Node 24 (`.nvmrc`, `engines`), shared `packages/config` (tsconfig strict flags from architecture §10, ESLint, Prettier, Vitest preset), one empty Next.js app per approved role (`apps/storefront`, `apps/seller`, `apps/admin`, `apps/agent` per FQ-2) rendering a placeholder page, root scripts (`dev`, `build`, `typecheck`, `lint`, `format`, `test`), CI workflow running them.
- **Exclusions:** UI, auth, API calls, styling beyond defaults, deployment.
- **Dependencies:** FQ-1, FQ-2, FQ-9, FQ-11 (all decided).
- **Files:** `package.json`, `.nvmrc`, `.gitignore`, `.editorconfig`, `packages/config/**`, `apps/*/{package.json,next.config.ts,tsconfig.json,src/app/layout.tsx,src/app/page.tsx}`, `.github/workflows/ci.yml`.
- **Acceptance criteria:** `npm ci && npm run build` builds every app; apps run on dev ports storefront **4100**, seller **4101**, admin **4102**, agent **4103** (free and outside every Windows-excluded range on this machine, OQ-14); CI green on a clean clone; Next.js version is a patched release.
- **Tests:** one smoke Vitest test per package; CI job proves lint/type errors fail the build.
- **DoD:** global DoD.

### T-B2 Environment configuration
- **Status (2026-10-14):** implemented and verified (65 tests; build fails on a missing public key; server start fails with key names only; a client import of server env fails the build; clean CI sequence green). Refinements: design 01 R-7…R-11.
- **Scope:** zod-validated env per app, split server/public, no defaults, startup failure naming missing keys (never values); `.env.example` per app; keys: `NILE_API_BASE_URL`, `SESSION_ENCRYPTION_KEYS`, `SESSION_ACTIVE_KEY_ID`, `APP_ORIGIN`, plus public ones.
- **Exclusions:** secret management in deployment (phase i).
- **Dependencies:** T-B1.
- **Files:** `apps/*/src/lib/env.ts`, `apps/*/.env.example`, `packages/config/env/*`.
- **Acceptance criteria:** missing/invalid key → process exits with the key names; no server key is importable from a client component (`server-only`); `.env*` ignored by git.
- **Tests:** unit tests for the schemas (valid, missing, malformed).
- **DoD:** global DoD.

### T-B3 OpenAPI snapshot, correction script and type generation
- **Status (2026-10-14):** implemented and verified: snapshot pinned to backend `4ad89a6` (`backend.lock.json`), corrections report 84 nullable response fields, 11 nullable request fields, 10 phantom properties removed, `idOrSlug`, governorate fee and `attr.*` fixed; 24 rule tests + compile-time checks on the generated types; drift check fails on stale types and on a hand-edited snapshot; clean CI sequence green. Refinement: design 01 R-12.
- **Scope:** `api:pull` (from `NILE_API_BASE_URL`), committed snapshot, `openapi-fix.ts` with the corrections in architecture §6.3, `openapi-typescript` generation, CI drift check.
- **Exclusions:** runtime client, React hooks.
- **Dependencies:** T-B1, FQ-9.
- **Files:** `packages/api/openapi/nile.openapi.json`, `packages/api/scripts/{pull.ts,openapi-fix.ts,generate.ts}`, `packages/api/src/generated/schema.d.ts`.
- **Acceptance criteria:** generated types contain all 123 operations; nullable response fields are `T | null`; no `__atLeastOneField`; `idOrSlug` accepts any string; re-running generation on an unchanged snapshot produces no diff.
- **Tests:** unit tests for each correction rule on minimal fixture documents; a test asserting the operation count and a sample of corrected fields.
- **DoD:** global DoD + corrections listed in `api-inventory.md` §9 are cross-referenced in code comments.

### T-B4 API client core
- **Status (2026-10-14):** implemented and verified: `createApiClient` + `unwrap`, `ApiError` (109 backend codes from the backend source + 4 client codes), `serverTransport`, `browserTransport` (BFF rewrite, single refresh-and-retry), `productQuery`/`inValues`/literal query serializer; 57 tests with MSW 3 (success, list meta, 204, each common error code, Retry-After, non-envelope, malformed JSON, network failure, abort, idempotency header and compile-time key requirement, retry once with the same key). Refinement: design 01 R-13.
- **Scope:** `openapi-fetch` wrapper: envelope unwrapping, `ApiError`, error-code union (api-inventory §7), `Retry-After` parsing, correlation id, idempotency-key parameter, literal filter/sort/cursor query builder, `buildProductQuery()` for `attr.*`; server transport (Bearer) and browser transport (`/api/bff`).
- **Exclusions:** auth/session (T-D1), TanStack hooks (T-B5).
- **Dependencies:** T-B3.
- **Files:** `packages/api/src/{client.ts,errors.ts,error-codes.ts,query.ts,transports.ts,index.ts}`.
- **Acceptance criteria:** a typed call `GET /products` returns `{ data, meta }`; every documented error shape becomes an `ApiError` with `code`, `details`, `correlationId`; network failure → `NETWORK_ERROR`; idempotent endpoints cannot be called without a key (type error).
- **Tests:** unit tests with MSW for success, list meta, each common error code, malformed JSON, 204, network error, idempotency header, query serialisation (`createdAt[gte]`, `status[in]`, `attr.color[in]`).
- **DoD:** global DoD.

### T-B5 TanStack Query foundation
- **Status (2026-10-14):** implemented and verified in `packages/query` (design R-1 moved it out of `packages/api`): query client defaults and per-request/singleton rule, key factory, cursor-list helper, shared public queries, `QueryProvider` in every app layout; 21 tests incl. the acceptance test (server prefetch hydrates with 0 client requests; a mutation that makes the client refetch fails it); devtools absent from production bundles. Refinement: design 01 R-14.
- **Scope:** `getQueryClient()` (per request on server, singleton in browser), providers per app, default options (architecture §6.5), query-key factory pattern, infinite-list helper for cursor pagination, `HydrationBoundary` usage example, devtools in development only.
- **Exclusions:** feature queries.
- **Dependencies:** T-B4.
- **Files:** `packages/api/src/react/{query-client.ts,keys.ts,infinite.ts}`, `apps/*/src/app/providers.tsx`.
- **Acceptance criteria:** a server-prefetched public query (`GET /categories`) hydrates without a client refetch; no server QueryClient is module-scoped.
- **Tests:** component test proving hydration without a second request (MSW request counter); unit test for `getNextPageParam`.
- **DoD:** global DoD.

### T-B6 Domain utilities
- **Scope:** money (parse/format/add with decimal library), dates (format in display zone, countdown from server timestamps), exhaustive enum label maps (api-inventory §8), shared Zod field schemas mirroring backend rules (email ≤ 254 lower-cased, Egyptian phone, money pattern, password 8 chars..72 UTF-8 bytes untrimmed, OTP 6 digits, slug), display-only status→actions helpers.
- **Exclusions:** UI components; localisation of labels beyond the default language until FQ-4.
- **Dependencies:** T-B1 (FQ-4 decided: English, `Africa/Cairo`).
- **Files:** `packages/domain/src/**`.
- **Acceptance criteria:** `"0.10" + "0.20" = "0.30"` exactly; a missing enum label fails type-checking; Zod schemas accept/reject the same samples as the backend rules in spec 01 §1.1.
- **Tests:** unit tests with boundary samples (72-byte multibyte password, `+2010…` vs `+2013…`, `"1234567890.12"`, rounding).
- **DoD:** global DoD.

### T-B7 Test infrastructure and contract tests
- **Scope:** MSW handlers typed from the schema, factories, render helpers; Playwright project with per-role fixtures; CI job that starts the backend from its repo (`docker compose up`, `seed:dev`, fake gateway, Mailpit), waits for `/health/ready`, runs contract tests that parse real responses with strict schemas (validates the OA-1 assumption).
- **Exclusions:** feature E2E tests (added per phase).
- **Dependencies:** T-B3, T-B4; access to the backend repo from CI (FQ-11).
- **Files:** `packages/test-utils/**`, `e2e/{playwright.config.ts,fixtures/**}`, `packages/api/contract/**`, `.github/workflows/{ci.yml,contract.yml}`.
- **Acceptance criteria:** contract suite covers every public GET plus one authenticated GET per role and the error envelope for 400/401/403/404; failures name the field and endpoint.
- **Tests:** the suite itself; a deliberately broken fixture proves it fails.
- **DoD:** global DoD + OA-1 assumption marked confirmed or corrected in `api-inventory.md`.

## Phase c — Design System

### T-C1 Tailwind + shadcn/ui setup and design tokens
- **Scope:** Tailwind CSS v4, shadcn/ui init in `packages/ui`, tokens (color, type scale, spacing, radius, shadow) as CSS variables, light theme (dark mode not in scope unless you ask), LTR only (FQ-4), font loading via `next/font`.
- **Exclusions:** product screens.
- **Dependencies:** T-B1. FQ-5: I propose the tokens; you approve them before T-C2.
- **Files:** `packages/ui/src/{theme.css,tokens.ts,cn.ts}`, `packages/ui/components.json`, `apps/*/src/app/globals.css`.
- **Acceptance criteria:** tokens documented on a token page; contrast of text tokens ≥ 4.5:1.
- **Tests:** visual sanity via Playwright screenshot of the token page; contrast unit test on token pairs.
- **DoD:** global DoD + tokens approved by you.

### T-C2 Core components
- **Scope:** Button, Input, Textarea, Select/Combobox, Checkbox/Switch, form Field (RHF-wired, error/description slots), Dialog/Sheet, Toast (with correlation id), Badge/StatusBadge (per enum), Money, DateTime, EmptyState, ErrorState, Skeletons, Pagination (load more / cursor stack), DataTable (sortable columns mapped to API sort, filters bound to URL), Countdown.
- **Exclusions:** feature-specific composites.
- **Dependencies:** T-C1, T-B6.
- **Files:** `packages/ui/src/components/**`, `packages/ui/src/data-table/**`.
- **Acceptance criteria:** every component is keyboard-operable with visible focus and labelled; DataTable never shows totals or page numbers (the API has none).
- **Tests:** component tests per component (render, interaction, a11y via axe); DataTable test with two cursor pages.
- **DoD:** global DoD.

### T-C3 Application shells per role
- **Scope:** layouts, navigation, header with session menu placeholder, responsive behaviour (agent shell mobile-first), `error.tsx`/`not-found.tsx` per app, role-specific landing placeholders.
- **Exclusions:** auth wiring (phase d), data.
- **Dependencies:** T-C2.
- **Files:** `apps/*/src/app/{layout.tsx,error.tsx,not-found.tsx}`, `apps/*/src/components/shell/**`.
- **Acceptance criteria:** shells render at 360 px, 768 px, 1280 px; skip-link present; landmarks correct.
- **Tests:** Playwright screenshots at three viewports; axe on each shell.
- **DoD:** global DoD.

## Phase d — Authentication

### T-D1 BFF session and route handlers
- **Scope:** encrypted session cookie (architecture §5.2), `POST /api/auth/{login,refresh,logout}` route handlers, per-app role check at login (wrong role → session discarded, explanatory error), BFF proxy `/api/bff/[...path]` with per-app path/method allow-list, Origin + custom-header CSRF checks, `no-store` headers, correlation id forwarding.
- **Exclusions:** UI screens (T-D4+), client refresh coordination (T-D2), production client-IP forwarding (blocked by OQ-1).
- **Dependencies:** T-B2, T-B4, FQ-1, FQ-8; **OQ-1 must be resolved before production**, not before local development.
- **Files:** `packages/auth/src/{session.ts,route-handlers.ts,proxy-allowlist.ts,csrf.ts}`, `apps/*/src/app/api/auth/[action]/route.ts`, `apps/*/src/app/api/bff/[...path]/route.ts`.
- **Acceptance criteria:** tokens never appear in any response body, client bundle or log; a request to a non-allow-listed path → 404 from the BFF; cross-origin POST → 403; a seller logging into the admin app gets no session; logout calls the backend and clears the cookie.
- **Tests:** unit (cookie encrypt/decrypt, tamper → rejected, key rotation, allow-list matrix); integration with MSW for login success/each error code, refresh success/`INVALID_REFRESH_TOKEN`, logout; CSRF tests.
- **DoD:** global DoD + security review checklist (architecture §9) for this PR.

### T-D2 Refresh coordination
- **Scope:** client refresh coordinator (Web Locks + `sv` cookie + BroadcastChannel fallback), 401 → refresh → single retry in the browser transport, proactive refresh timer while visible, RSC "expired session" boundary that refreshes then `router.refresh()`, cross-tab logout.
- **Exclusions:** none beyond T-D1.
- **Dependencies:** T-D1.
- **Files:** `packages/auth/src/client/{refresh-coordinator.ts,session-boundary.tsx}`, `packages/api/src/transports.ts`.
- **Acceptance criteria:** with 2+ tabs and 10 concurrent requests after expiry exactly **one** backend `/auth/refresh` call is made and no session is revoked; `INVALID_REFRESH_TOKEN` logs out every tab.
- **Tests:** unit tests with fake locks/timers; Playwright test opening two tabs against the real backend with a short-TTL environment (or by waiting out the access TTL in a nightly job) asserting a single refresh in backend logs/MSW counter.
- **DoD:** global DoD.

### T-D3 Route protection
- **Scope:** `proxy.ts` optimistic guard per app (redirect with `returnTo`), `requireSession(role)` DAL used by every protected server entry point, role landing redirect after login.
- **Exclusions:** business-status gating (seller approval, agent active) — in phase h.
- **Dependencies:** T-D1.
- **Files:** `apps/*/src/proxy.ts`, `apps/*/src/lib/dal.ts`, `packages/auth/src/dal.ts`.
- **Acceptance criteria:** every protected route redirects when logged out; `returnTo` only accepts same-origin relative paths (no open redirect); Server Actions/Route Handlers without a session return 401.
- **Tests:** component/route tests per guard; E2E: deep link while logged out → login → back to the deep link.
- **DoD:** global DoD.

### T-D4 Customer auth screens (workflow C-2)
- **Scope:** login, register customer, verify email (with resend + 60 s countdown), forgot password, reset password, logout; error mapping per api-inventory §7.2; `EMAIL_NOT_VERIFIED` → verify step.
- **Exclusions:** social login, phone OTP (not in API).
- **Dependencies:** T-D1…T-D3, T-C2.
- **Files:** `apps/storefront/src/app/(auth)/**`, `apps/storefront/src/features/auth/**`.
- **Acceptance criteria:** messages never reveal whether an email exists (forgot/resend are generic); rate-limit errors show a countdown; passwords never trimmed.
- **Tests:** component tests per form (validation, each server error); E2E: register → read OTP from Mailpit → verify → logged in; forgot → reset → login.
- **DoD:** global DoD.

### T-D5 Seller registration and auth screens (workflow S-1)
- **Scope:** seller login/register (business name, phone, pickup address with governorate select), verify email, password reset, post-login status page.
- **Exclusions:** seller features (phase h).
- **Dependencies:** T-D4 patterns, T-D1…T-D3.
- **Files:** `apps/seller/src/app/(auth)/**`, `apps/seller/src/features/auth/**`.
- **Acceptance criteria:** `BUSINESS_NAME_TAKEN`, `GOVERNORATE_NOT_FOUND` mapped to fields; after verification the seller lands on a status page reflecting `pending_approval`.
- **Tests:** component tests; E2E register → verify → status page.
- **DoD:** global DoD.

### T-D6 Invite acceptance (admins, agents)
- **Scope:** neutral `/invite?token=…` page in the storefront (architecture §5.7): set password, server-side accept, immediate session discard (no cookie set), redirect to the admin or agent app login with a "password set" notice; token removed from the URL after reading. Admin and agent `/login` pages show that notice.
- **Exclusions:** invite sending (phase h); a backend per-role invite URL.
- **Dependencies:** T-D1; backend env `INVITE_URL_BASE` pointed at `<storefront>/invite` (locally `http://localhost:4100/invite`).
- **Files:** `apps/storefront/src/app/invite/**`, `apps/storefront/src/app/api/auth/invite/route.ts`, `packages/auth/src/route-handlers.ts`, `apps/{admin,agent}/src/app/(auth)/login/**`.
- **Acceptance criteria:** invalid/expired token shows "ask an admin to resend"; the storefront never sets a session cookie for an admin/agent; the token never appears in logs or analytics.
- **Tests:** unit test that the handler always calls logout and sets no cookie; component tests; E2E: admin invites admin and agent → links from Mailpit → accept → redirected → sign in to the right app.
- **DoD:** global DoD.

### T-D7 Change password (all apps)
- **Scope:** security page: change password (BFF supplies the refresh token), notice that other sessions end.
- **Exclusions:** "log out everywhere" (no endpoint, OQ-9).
- **Dependencies:** T-D1.
- **Files:** `packages/auth/src/route-handlers.ts` (change-password handler), `apps/*/src/features/security/**`.
- **Acceptance criteria:** `INVALID_CURRENT_PASSWORD`, `PASSWORD_UNCHANGED` mapped to fields; session stays valid afterwards.
- **Tests:** component + E2E (change → still logged in → old password fails at next login).
- **DoD:** global DoD.

## Phase e — Catalog (workflow C-1)

### T-E1 Category navigation and category pages
- **Scope:** category tree menu (`GET /categories`, server-prefetched, revalidated), category page by slug with breadcrumbs, subcategory links.
- **Exclusions:** product listing logic (T-E2).
- **Dependencies:** T-B5, T-C3, FQ-7.
- **Files:** `apps/storefront/src/app/(shop)/c/[slug]/**`, `apps/storefront/src/features/catalog/{api.ts,components/category-*.tsx}`.
- **Acceptance criteria:** unknown slug → 404 page; inactive categories never shown.
- **Tests:** component tests (tree rendering, slug resolution); E2E navigation.
- **DoD:** global DoD.

### T-E2 Product listing, search and filters
- **Scope:** listing with infinite/“load more” cursor paging; search `q` (2..100); filters (price range, in stock, attribute facets from `GET /categories/:id/attributes` when a category is selected); sort options valid for the context (relevance only with `q`); all state in the URL.
- **Exclusions:** result counts (API has none); autocomplete (no endpoint).
- **Dependencies:** T-E1, T-B4 (`buildProductQuery`).
- **Files:** `apps/storefront/src/app/(shop)/{search,c/[slug]}/**`, `apps/storefront/src/features/catalog/**`.
- **Acceptance criteria:** never sends an invalid combination (attr without category, > 5 attr filters, relevance without `q`); `INVALID_QUERY`/`INVALID_CURSOR` reset to defaults; back/forward restores filters.
- **Tests:** unit tests for URL ⇄ query mapping; component tests for facets and paging; E2E search + filter.
- **DoD:** global DoD.

### T-E3 Product detail and variant selection
- **Scope:** product page by slug (server-rendered, `no-store`), description as plain text, seller link (`/search?seller=`), variant picker by option, price/compare-at, availability (`availableQuantity`), add-to-cart entry point (logged out → login with `returnTo` carrying variant and quantity, FQ-6), SEO metadata.
- **Exclusions:** images, reviews (not in API); the cart write itself (T-F1).
- **Dependencies:** T-E2 (FQ-6 decided: login required to add).
- **Files:** `apps/storefront/src/app/(shop)/p/[slug]/**`, `apps/storefront/src/features/catalog/components/product-*.tsx`, `variant-picker.tsx`.
- **Acceptance criteria:** the selected variant always matches exactly one `variants[]` entry or shows "combination unavailable"; out-of-stock variants are visible but not addable; hidden product → 404.
- **Tests:** unit tests for variant matching (incl. default variant with no options); component tests; E2E open product → choose variant.
- **DoD:** global DoD.

## Phase f — Cart & Checkout

### T-F1 Cart (workflow C-4)
- **Scope:** add from product page (logged-out visitor → login/register → back to the product with variant and quantity preselected, FQ-6), cart page grouped by seller, quantity change (1..99, ≤ `availableQuantity`), remove, empty, issue display and resolution, header cart count (`itemCount`).
- **Exclusions:** guest cart, automatic add after login (FQ-6).
- **Dependencies:** T-E3, T-D3.
- **Files:** `apps/storefront/src/app/cart/**`, `apps/storefront/src/features/cart/**`.
- **Acceptance criteria:** cart state always comes from the last `CartDto` response; ambiguous add failures refetch instead of retrying; issue lines excluded from totals exactly as the API reports; "Checkout" disabled while `hasIssues`.
- **Tests:** component tests for every `issue` value and error code; E2E add → change → remove.
- **DoD:** global DoD.

### T-F2 Address selection at checkout (workflow C-3, C-5)
- **Scope:** choose/add an address in checkout; governorate picker marking non-deliverable ones; delivery fee display.
- **Exclusions:** full address book management (T-G2), though components are shared.
- **Dependencies:** T-F1, T-G2 components (or built here and reused there).
- **Files:** `apps/storefront/src/features/addresses/**`, `apps/storefront/src/app/checkout/**`.
- **Acceptance criteria:** a non-deliverable address cannot proceed; the default-address rules of spec 04 C-3 are respected in the form (no "unset default").
- **Tests:** component tests; MSW scenarios for `ADDRESS_LIMIT_REACHED`, `GOVERNORATE_NOT_FOUND`.
- **DoD:** global DoD.

### T-F3 Checkout with cash on delivery (workflow C-6, COD path)
- **Scope:** review step (per-seller groups, items total, fee, total), `expectedTotal` computed with decimals, `POST /checkout` with one idempotency key per attempt intent, the full error-recovery table of workflow C-6, confirmation page.
- **Exclusions:** Kashier (T-F4).
- **Dependencies:** T-F2, T-B6 (OQ-15: computation recommended in api-inventory §10.4).
- **Files:** `apps/storefront/src/features/checkout/**`, `apps/storefront/src/app/checkout/**`.
- **Acceptance criteria:** double-click/refresh never creates two orders (same key replayed); `ORDER_TOTAL_CHANGED` shows the new total and requires a fresh confirmation with a new key; after success the cart query is invalidated.
- **Tests:** unit test for `expectedTotal`; component tests for each error; E2E COD order end to end (cart → order visible in `GET /orders`).
- **DoD:** global DoD.

### T-F4 Kashier payment and return page
- **Scope:** save the order id in `sessionStorage` and redirect to `checkoutUrl` (https check), recovery via `kashier-session` when `null`, return page locating the order (saved id, else newest `pending_payment`/`placed` order) and polling `GET /orders/:id` until placed/cancelled/expired with countdown from `paymentExpiresAt`, "pay now" on pending orders, `ORDER_PAYMENT_PENDING` handling.
- **Exclusions:** refunds (admin, phase h).
- **Dependencies:** T-F3; backend env `KASHIER_REDIRECT_URL` pointed at `<storefront>/checkout/payment-return` (OQ-2; locally `http://localhost:4100/checkout/payment-return`).
- **Files:** `apps/storefront/src/app/checkout/payment-return/**`, `apps/storefront/src/features/checkout/kashier/**`.
- **Acceptance criteria:** the return page ignores redirect query parameters for the outcome; the session survives the cross-site return (verifies the `SameSite=Lax` assumption); polling stops on a terminal state or after the window.
- **Tests:** component tests with fake timers; E2E with the fake gateway + signed webhook script: paid path and expired path.
- **DoD:** global DoD.

## Phase g — Orders & Account

### T-G1 Customer profile (workflow C-3)
- **Scope:** view/edit name and phone; email read-only.
- **Exclusions:** email change (no endpoint).
- **Dependencies:** T-D3.
- **Files:** `apps/storefront/src/app/account/**`, `apps/storefront/src/features/account/**`.
- **Acceptance criteria:** PATCH sends only changed fields; empty change disabled.
- **Tests:** component tests; E2E edit profile.
- **DoD:** global DoD.

### T-G2 Address book
- **Scope:** list, create, edit, delete, set default (rules in workflow C-3).
- **Exclusions:** maps/geolocation.
- **Dependencies:** T-G1 (or T-F2 components).
- **Files:** `apps/storefront/src/app/account/addresses/**`, `apps/storefront/src/features/addresses/**`.
- **Acceptance criteria:** list order matches the API (default first); limit message at 20; nullable fields sent as `null` only where allowed.
- **Tests:** component tests for each rule and error; E2E CRUD.
- **DoD:** global DoD.

### T-G3 Orders list and detail (workflow C-7)
- **Scope:** orders list with status filter and cursor paging; detail with totals, payment status, address, seller orders, items (incl. cancelled quantities), timelines.
- **Exclusions:** live tracking (no data).
- **Dependencies:** T-F3.
- **Files:** `apps/storefront/src/app/account/orders/**`, `apps/storefront/src/features/orders/**`.
- **Acceptance criteria:** every order and seller-order status has a label; someone else's order id → not-found page.
- **Tests:** component tests per status; E2E list → detail.
- **DoD:** global DoD.

### T-G4 Customer cancellation (workflow C-8)
- **Scope:** cancel a seller order when `canCancel`, optional note, idempotency key, refund notice for Kashier.
- **Exclusions:** item-level cancel (seller only).
- **Dependencies:** T-G3.
- **Files:** `apps/storefront/src/features/orders/cancel-*.tsx`.
- **Acceptance criteria:** button only when `canCancel`; `SELLER_ORDER_NOT_CANCELLABLE` refreshes the order and explains.
- **Tests:** component tests; E2E cancel a COD seller order.
- **DoD:** global DoD.

## Phase h — Seller & Admin (+ Agent)

Seller app (workflows S-1…S-6):

### T-H1 Seller shell, status gating, profile, re-apply
- **Scope:** status banner from `GET /seller/profile`; write actions disabled with explanation unless `approved`; profile edit; re-apply when `rejected`.
- **Exclusions:** products, orders.
- **Dependencies:** T-D5, T-C3.
- **Files:** `apps/seller/src/features/profile/**`, `apps/seller/src/app/(portal)/**`.
- **Acceptance criteria:** each of the four statuses renders the right guidance; `SELLER_NOT_APPROVED` from any write shows the same guidance.
- **Tests:** component tests per status; E2E rejected → edit → re-apply (admin action seeded via API in the test).
- **DoD:** global DoD.

### T-H2 Products and variants
- **Scope:** product list (filters), create draft, edit, delete, activate/deactivate; variant create (option matrix from effective attributes, one option per attribute; default-variant case), edit, delete.
- **Exclusions:** images, bulk import (no API).
- **Dependencies:** T-H1.
- **Files:** `apps/seller/src/features/products/**`, `apps/seller/src/app/(portal)/products/**`.
- **Acceptance criteria:** the variant form cannot submit an incomplete option set; `VARIANT_OPTIONS_INVALID` details mapped; category change disabled once variants exist; all 409/422 codes of spec 06 handled.
- **Tests:** component tests (option matrix, compare-at validation, each error); E2E create product → variant → activate → visible on storefront.
- **DoD:** global DoD.

### T-H3 Stock adjustments and history
- **Scope:** delta adjustments with idempotency key; optional "set to N" helper computing the delta from fresh `onHand` with explicit confirmation; movements list.
- **Exclusions:** absolute stock set (not in API).
- **Dependencies:** T-H2.
- **Files:** `apps/seller/src/features/stock/**`.
- **Acceptance criteria:** the confirmation always shows the delta that will be sent; `STOCK_ADJUSTMENT_INVALID` explained with reserved quantity.
- **Tests:** unit test for delta computation; component tests; E2E adjust and see history.
- **DoD:** global DoD.

### T-H4 Seller orders
- **Scope:** list with status filters, detail, accept, ready, cancel, item cancel (reason/note rules), return received, accept-deadline countdown, polling per OQ-13.
- **Exclusions:** customer PII (not provided by API).
- **Dependencies:** T-H1 (polling: 60 s while visible, api-inventory §10.4).
- **Files:** `apps/seller/src/features/orders/**`, `apps/seller/src/app/(portal)/orders/**`.
- **Acceptance criteria:** only actions valid for the status are offered; idempotent actions reuse their key on retry; invalid-transition 409 refreshes the order.
- **Tests:** component tests per status/action; E2E: customer COD order → seller accepts → ready.
- **DoD:** global DoD.

### T-H5 Seller finance
- **Scope:** balance, ledger statement, payouts list.
- **Exclusions:** payout requests (no endpoint).
- **Dependencies:** T-H1.
- **Files:** `apps/seller/src/features/finance/**`.
- **Acceptance criteria:** `"0.00"`/`updatedAt: null` shown as "no earnings yet"; entry types labelled.
- **Tests:** component tests; E2E smoke.
- **DoD:** global DoD.

Admin app (workflows AD-1…AD-7):

### T-H6 Admin shell and admin accounts
- **Scope:** navigation; invite admin, list admins, resend invite, suspend (reason)/reactivate admins.
- **Exclusions:** customer suspension and agent invite resend (OQ-7: no `userId` exposed; gap accepted for R1).
- **Dependencies:** T-D6, T-C3.
- **Files:** `apps/admin/src/features/admins/**`.
- **Acceptance criteria:** cannot suspend self (button hidden, `CANNOT_SUSPEND_SELF` handled).
- **Tests:** component + E2E invite → accept → suspend → login refused.
- **DoD:** global DoD.

### T-H7 Seller management and commission
- **Scope:** sellers list/filters, detail with histories, approve/reject/suspend/reinstate with reasons, commission rate per seller, default commission setting.
- **Exclusions:** —
- **Dependencies:** T-H6.
- **Files:** `apps/admin/src/features/sellers/**`, `apps/admin/src/features/settings/commission/**`.
- **Acceptance criteria:** actions offered per status; `SELLER_EMAIL_NOT_VERIFIED` explained; rates entered as percentages and sent as `rate` strings (e.g. 12.5 % → `"0.1250"`).
- **Tests:** unit test for percent⇄rate; component tests; E2E approve a seeded seller.
- **DoD:** global DoD.

### T-H8 Catalog structure
- **Scope:** category tree editor (create, rename, slug, order, activate/deactivate), attributes and options CRUD with the constraints of workflow AD-3.
- **Exclusions:** moving categories, deleting categories (not in API).
- **Dependencies:** T-H6.
- **Files:** `apps/admin/src/features/catalog/**`.
- **Acceptance criteria:** depth limit and inactive-parent rules reflected in the UI; every catalog error code mapped.
- **Tests:** component tests per error; E2E create category → attribute → option → seller can use it.
- **DoD:** global DoD.

### T-H9 Delivery setup, agents and shipments
- **Scope:** governorate fees (set/clear), agent fee-share setting, agents CRUD/activate/deactivate, shipments list (unassigned queue), detail, assign/reassign.
- **Exclusions:** reassignment after pickup (not in API); agent invite resend (OQ-7).
- **Dependencies:** T-H6.
- **Files:** `apps/admin/src/features/{delivery,agents,shipments}/**`.
- **Acceptance criteria:** `AGENT_HAS_ACTIVE_SHIPMENTS` links to that agent's shipments; assign dialog lists active agents only.
- **Tests:** component tests; E2E set fee → create agent → assign shipment.
- **DoD:** global DoD.

### T-H10 Orders, payments and refund queue
- **Scope:** orders list/detail with histories, payment view, refunds work queue, record refund with idempotency key.
- **Exclusions:** admin order cancellation (S-9, not in API).
- **Dependencies:** T-H6.
- **Files:** `apps/admin/src/features/{orders,payments}/**`.
- **Acceptance criteria:** queue defaults to `pending_manual`, oldest first; recording requires the provider reference.
- **Tests:** component tests; E2E Kashier late-payment scenario → refund appears → record.
- **DoD:** global DoD.

### T-H11 Finance
- **Scope:** accounts list/detail/statement, reference lookup, COD remittance form, payout form (`paidAt` not in the future), lists.
- **Exclusions:** —
- **Dependencies:** T-H6.
- **Files:** `apps/admin/src/features/finance/**`.
- **Acceptance criteria:** amounts validated as money strings; idempotency keys reused on retry; `*_EXCEEDS_BALANCE` shows the current balance.
- **Tests:** component tests; E2E remittance after a delivered COD order.
- **DoD:** global DoD.

Agent app (FQ-2 = yes; workflows A-1…A-4):

### T-H12 Agent app
- **Scope:** profile/status, shift toggle, active shipments, shipment detail with call/navigation links, picked-up / out-for-delivery / delivered (COD amount equal to `amountToCollect`) / failed attempt / returned, history, finance.
- **Exclusions:** offline mode, maps, push notifications (no API support).
- **Dependencies:** T-D6, T-C3 (polling 30 s while visible; `AGENT_INACTIVE` handled by code, OQ-12).
- **Files:** `apps/agent/src/features/**`.
- **Acceptance criteria:** usable one-handed at 360 px; COD amount prefilled and must match; inactive agent sees status only.
- **Tests:** component tests per transition; E2E full delivery of a COD order.
- **DoD:** global DoD.

## Phase i — Hardening & Release

### T-I1 Security headers and CSP
- **Scope:** nonce-based CSP via `proxy.ts`, HSTS, frame, referrer, permissions policies per app; CSRF and session abuse tests.
- **Dependencies:** all feature phases.
- **Files:** `apps/*/src/proxy.ts`, `packages/auth/src/headers.ts`.
- **Acceptance criteria:** no CSP violations in the E2E suite; securityheaders-style checks pass.
- **Tests:** E2E header assertions; CSP report-only run before enforcing.
- **Exclusions / DoD:** no WAF/infra config here (T-I5); global DoD.

### T-I2 Accessibility audit
- **Scope:** full axe pass, keyboard-only walkthrough of every workflow, screen-reader spot checks (NVDA/VoiceOver).
- **Dependencies:** feature phases. **Files:** fixes across apps.
- **Acceptance criteria:** zero serious/critical axe violations; every workflow completable by keyboard.
- **Tests:** axe in all E2E specs. **Exclusions / DoD:** formal certification excluded; global DoD.

### T-I3 Performance
- **Scope:** Web Vitals budgets for storefront (LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on a mid-range mobile profile), bundle analysis, query/polling cost review against backend rate limits.
- **Dependencies:** phases e–g. **Files:** config + targeted fixes.
- **Acceptance criteria:** Lighthouse CI budgets green on catalog, product, cart pages.
- **Tests:** Lighthouse CI nightly. **Exclusions / DoD:** backend performance excluded; global DoD.

### T-I4 Observability
- **Scope:** structured server logs with correlation ids, redaction rules; choice and setup of an error-monitoring service (FQ-10: decided together with hosting).
- **Dependencies:** FQ-3. **Files:** `packages/observability/**` (new) or app `lib/`.
- **Acceptance criteria:** a failed API call can be traced from the UI toast to backend logs via the correlation id; no PII/tokens in reports.
- **Tests:** unit tests for redaction. **Exclusions / DoD:** dashboards/alerting infra excluded unless agreed; global DoD.

### T-I5 Deployment pipeline
- **Scope:** container or platform build per app, environments (staging/prod), secret injection, domains/TLS, cache headers, rollback.
- **Dependencies:** **FQ-3 and FQ-8 (deferred by you), OQ-1 fixed in the backend, staging values of `INVITE_URL_BASE` and `KASHIER_REDIRECT_URL` set** in backend config.
- **Files:** `Dockerfile`s or platform config, `.github/workflows/deploy.yml`, `docs/frontend/runbooks/*`.
- **Acceptance criteria:** staging deploy from `main` with E2E smoke against staging backend; rollback documented and rehearsed.
- **Tests:** smoke E2E on staging. **Exclusions / DoD:** production go-live is a separate decision; global DoD.

### T-I6 Release readiness
- **Scope:** full E2E regression across roles, open-question review, known-limitations page (no images, no guest cart if chosen, etc.), handover docs.
- **Dependencies:** T-I1…T-I5.
- **Acceptance criteria:** all workflows in `workflows.md` covered by passing E2E tests; no open blocker in OQ/FQ lists.
- **Tests:** full suite. **Files:** `docs/frontend/release-notes.md`. **Exclusions / DoD:** marketing/legal pages excluded; global DoD.

## Dependency summary

```
T-A1 ─► T-B1 ─► T-B2 ─┐
            └► T-B3 ─► T-B4 ─► T-B5 ─┐
            └► T-B6                  ├─► T-C1 ─► T-C2 ─► T-C3 ─► T-D1 ─► T-D2, T-D3 ─► T-D4…T-D7
               T-B7 (after T-B4) ────┘
T-D* ─► T-E1 ─► T-E2 ─► T-E3 ─► T-F1 ─► T-F2 ─► T-F3 ─► T-F4 ─► T-G1…T-G4 ─► T-H* ─► T-I*
Blockers: OQ-1 (backend change, before production); FQ-3/FQ-8 (deferred hosting/domains, T-I5 only); token approval (T-C1 → T-C2)
```

Phases c and the first part of d can overlap with b once T-B4 is merged; seller and admin tasks in h are independent of each other and can run in parallel.
