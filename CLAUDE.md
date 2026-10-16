# CLAUDE.md — Nile Marketplace Web (frontend)

Read this whole file before every task. These rules are binding. If a rule conflicts with a request, say so and ask; don't silently break the rule.

## 0. Working agreement

- **Never assume.** If a requirement, business rule, UX behaviour or technical choice is ambiguous or missing, stop and ask. List the options and give a recommendation. Unresolved items go in §14.3 "Still open" until the user settles them.
- **No code without an approved spec.** Order of work: discovery → business spec (`docs/frontend/spec/`) → system design → implementation plan → code. Don't scaffold anything ahead of its phase.
- **The backend is the source of truth** for business rules, permissions, validation, pricing, stock, orders and payments. The backend repo (`../nile-marketplace2`, remote `github.com/eslam94fathy/nile-marketplace2`) is **read-only** from this project: never modify it. A needed backend change is raised as a question, never worked around.
- **`@nile/*` are workspace packages only.** `.npmrc` points the scope at an unresolvable registry so nothing can be fetched from the public registry under that name (the scope is unclaimed there). Add a workspace dependency by editing `package.json` (`"@nile/x": "*"`) and running `npm install`, never `npm install @nile/x`.
- **Never invent endpoints, fields, status values or business rules.** Every API call must exist in the committed OpenAPI snapshot; every rule must trace to the backend spec (`../nile-marketplace2/docs/spec/`) or to an approved frontend spec.
- Label claims in docs: **[VERIFIED]** (seen in the running API/OpenAPI/backend code), **[SPEC]** (backend spec), **[PROPOSED]** (not yet approved), **[ASSUMPTION]** (to be proved), **[OPEN]** (question).
- Keep changes small and reviewable, and stick to the task.
- Report outcomes honestly. If tests, lint, type-check or build fail, say so and include the output.

## 1. Stack (fixed)

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) **16.3.8** (exact pins, `save-exact`), latest patch of the mature 16.x line; never below the July 2026 security release (16.2.11); keep it patched |
| UI runtime / language | React 19, TypeScript `strict` (flags in §10) |
| Styling / components | Tailwind CSS v4, shadcn/ui (Radix primitives), components owned in `packages/ui` |
| Server state | TanStack Query v5 |
| Forms / validation | React Hook Form + Zod (+ `@hookform/resolvers`) |
| API types / client | `openapi-typescript` + `openapi-fetch`, generated from a committed OpenAPI snapshot |
| Session crypto | `jose` (encrypted session cookie) |
| Money | `decimal.js` (never JS `number` for money) |
| Tests | Vitest, Testing Library, MSW, Playwright, `@axe-core/playwright` |
| Lint / format | ESLint **9.39.5** (see TB-1) with `eslint-config-next` core-web-vitals (react, react-hooks, jsx-a11y, import, @next/next), `typescript-eslint` strict + stylistic type-checked, `@tanstack/eslint-plugin-query` (from T-B5), import boundaries (as packages appear); Prettier 3. Shared config: `@nile/config/eslint` |
| TypeScript | **6.0.x** (typescript-eslint supports TypeScript < 6.1; TypeScript 7 would break type-aware linting) |
| Package manager / runtime | npm workspaces, Node 24 LTS (`.nvmrc`), lockfile committed, `npm ci` in CI |
| Language | English only, LTR. No i18n library |

New dependencies need a reason and user approval (approved set: architecture §11.1 FQ-9). Prefer well-maintained libraries with types included.

## 2. Repository structure (FQ-1: monorepo, one app per role)

```
apps/
  storefront/   # visitor + customer (+ neutral /invite landing)   dev port 4100
  seller/       # seller portal                                    dev port 4101
  admin/        # admin console                                    dev port 4102
  agent/        # delivery agent, mobile-first                     dev port 4103
packages/
  api/          # OpenAPI snapshot, fix script, generated types, typed client, ApiError, error codes, query builders
  auth/         # session cookie, BFF route handlers, proxy allow-list, DAL helpers, client refresh coordinator
  auth-screens/ # sign-in, verify-email, forgot/reset password screens shared by the apps (no Next.js)
  domain/       # money, dates, enum labels, display-only status helpers, shared Zod field schemas
  ui/           # shadcn/ui components, tokens, theme, data table
  config/       # tsconfig, eslint, prettier, vitest presets
  test-utils/   # MSW handlers, factories, render helpers
e2e/            # Playwright, per role, against the real backend
docs/frontend/  # discovery docs, spec/, design/
```

Inside an app: `src/app/` (routes only: thin pages that compose features), `src/features/<feature>/{index.ts, api.ts, components/, schemas.ts, hooks.ts, lib/}`, `src/lib/` (env, DAL, query client), `src/proxy.ts`.

### 2.1 Boundary rules (enforced by ESLint)
1. Apps import packages; packages never import apps.
2. `packages/api` and `packages/domain` never import React or Next.js.
3. A feature imports another feature only through its `index.ts`.
4. Only `packages/api` talks HTTP to the backend. Components never call `fetch` directly.
5. Server-only modules import `server-only`; client components never import them.

## 3. Backend contract

- Base `/api/v1`, envelope `{ success, data, meta? }` / `{ success: false, error: { code, message, details? }, correlationId }`. The client wrapper unwraps it; nothing else parses envelopes.
- **Errors are handled by `error.code`, never by message text or status alone.** The code catalogue lives in `packages/api/src/error-codes.ts`, maintained from `docs/frontend/api-inventory.md` §7.
- **Strict request bodies:** send exactly the documented fields. Unknown keys and `null` on non-nullable optional fields are rejected (`400`). PATCH sends only changed fields, never an empty body.
- **Money is a decimal string** (`"150.00"`, EGP, no currency field). Rates are strings (`"0.1000"`). Never convert money to `number`.
- **Cursor pagination only** (`limit`, `cursor`, `sort`, `meta.nextCursor/hasMore`). No totals, no page numbers, no previous cursor. Filters are literal keys (`createdAt[gte]`).
- **Idempotency:** endpoints that require `Idempotency-Key` get **one UUID per user intent**, reused on every retry of that intent; a new key only when the intent (body) changes.
- **Calling the backend:** `unwrap(api.GET('/api/v1/…', { params, body }))` returns `{ data, meta }` or throws `ApiError`; check errors with `isApiError(e, 'CODE')`. Query values are scalars; use `inValues([...])` for `[in]` filters and `productQuery()` for `GET /products` (it rejects combinations the backend refuses). Tests mock HTTP with MSW 3 (`server.listen({ onUnhandledFrame: 'error' })`).
- **Ownership failures are `404`.** Show "not found", never "forbidden", for another user's resource.
- **Contract workflow (T-B3):** start the backend at the commit to adopt, then `NILE_API_BASE_URL=http://localhost:3100 npm run api:pull -- --commit <40-char sha>` → `npm run api:gen` → review the diff of `packages/api/openapi/nile.openapi.json` and `src/generated/schema.d.ts` → fix anything `openapi-fix.ts` throws on (it fails when a corrected target disappears) → commit snapshot, `backend.lock.json` and generated types together. `npm run api:check` (CI) fails on a hand-edited snapshot or stale generated types.
- **OpenAPI snapshot:** `packages/api/openapi/nile.openapi.json` is committed; generated files are never edited by hand; known defects are corrected only in `packages/api/scripts/openapi-fix.ts` (api-inventory §9). CI fails on drift.

## 4. Authentication and session (architecture §5)

- **Tokens never reach browser JavaScript.** Access and refresh tokens live only in an encrypted, `HttpOnly; Secure; SameSite=Lax; Path=/` cookie named `__Host-nile_<app>_session`, read and written only by the app's server code.
- The browser calls the backend **only** through the app's BFF routes (`/api/auth/*`, `/api/bff/*`). Each app's BFF has a path/method **allow-list** for its role.
- **Refresh is serialised:** only `POST /api/auth/refresh` refreshes; browsers serialise it across tabs (Web Locks); Server Components never refresh. Reuse of an old refresh token revokes the whole session (backend has no grace window).
- Each app accepts only its own role at login; another role's token is discarded at once.
- Authorization layers: `proxy.ts` (optimistic redirect) → DAL `requireSession(role)` in every protected Server Component, Server Action and Route Handler → backend (final). Never rely on `proxy.ts` alone.
- CSRF: `SameSite=Lax` + `Origin` check + `X-Nile-Client` header on every mutating BFF route; Server Actions validate input with Zod and check the session first.
- Never log or display tokens, cookies, passwords, OTPs, invite tokens, or full addresses/phones in logs.

## 5. Data fetching (TanStack Query)

- Per-request `QueryClient` on the server, singleton in the browser. Never a module-level server client.
- Query keys come from one factory per resource; `queryOptions()` live in `features/<f>/api.ts` and are shared by prefetch, hooks and invalidation.
- Prefetch on the server + `HydrationBoundary` only where server rendering is specified (catalog, SEO pages).
- Lists: `useInfiniteQuery` on `meta.nextCursor`.
- Retries: queries retry only on network errors and `5xx`; mutations never auto-retry unless idempotent with the same key.
- Mutations update the cache from the response when the API returns the resource, otherwise invalidate precise keys.
- Polling only where a spec says so, only while the tab is visible.
- Clear the whole cache on logout (`clearPrivateQueries` keeps only `public` keys).
- TanStack Query 5.104+: never `prefetchQuery`/`fetchQuery`/`fetchInfiniteQuery`/`isServer` (deprecated; lint fails). Use `queryClient.query(options)` (add `.catch(noop)` for a prefetch that must not throw), `queryClient.infiniteQuery(options)`, `environmentManager.isServer()`.

## 6. Forms (React Hook Form + Zod)

- One Zod schema per form, built from shared field schemas in `packages/domain` that mirror the backend DTO rules, typed with `satisfies` against the generated request type.
- Trim strings like the backend does; **never trim passwords**; passwords max 72 UTF-8 bytes.
- Map `VALIDATION_FAILED` `details[].field` onto form fields; unmatched details go to a form-level alert.
- Disable submit while submitting; keep the idempotency key for the life of the intent.

## 7. UI rules

- shadcn/ui components from `packages/ui` only; no ad-hoc copies in apps. Status badges: `<StatusBadge value labels tones />` with the view's label map and the enum's tone map; no inline `style` attributes (CSP).
- Every screen defines **loading, empty, error, and not-authorised** states (spec notation in `docs/frontend/spec/00-conventions.md`).
- Accessibility target WCAG 2.2 AA: keyboard-complete, visible focus, labelled controls, correct landmarks, no colour-only meaning. axe: zero serious/critical violations.
- Plain-text API content (e.g. product descriptions) is rendered as text, never as HTML. No `dangerouslySetInnerHTML` with API data.
- Copy for enum values and error codes comes from central maps (`packages/domain/labels`, error-message map), never inline literals.
- No product images in R1 (backend has none).

## 8. Money, dates, numbers

- Money: format with `Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' })` from the string; arithmetic only with `decimal.js` (`ROUND_HALF_UP`), only where a spec requires it (checkout `expectedTotal`).
- Dates: API strings are ISO UTC; display with `Intl.DateTimeFormat('en-EG', { timeZone: 'Africa/Cairo' })`. Countdowns are computed from server timestamps.
- Phone numbers are Egyptian mobiles in E.164 (`^\+20(10|11|12|15)\d{8}$`).

## 9. Security

1. Patched Next.js; `npm audit` in CI.
2. Nonce-based CSP from `proxy.ts`, no `unsafe-inline` scripts, `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
3. `Cache-Control: no-store` on every authenticated response; no authenticated data in any shared cache.
4. Redirect targets (`returnTo`) accept only same-origin relative paths. External URLs from the API (Kashier `checkoutUrl`) are used only after checking `https:`.
5. No feature is "secured" only by hiding it in the UI.

## 10. Code style

- TS flags: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, `noFallthroughCasesInSwitch`.
- No `any` (use `unknown` and narrow); no non-null `!` on data that can be missing.
- Server Components by default; `"use client"` only for interactive leaves.
- No magic strings: routes, query keys, cookie/header names, storage keys, polling intervals and labels are constants.
- Naming: files `kebab-case.tsx`, components `PascalCase`, hooks `useX`, constants `UPPER_SNAKE_CASE`.
- Functions do one thing; early returns; comments explain *why*.

## 11. Configuration and secrets

- All config from env, validated with Zod at startup, split into server and public (`NEXT_PUBLIC_*`) schemas. **No defaults.** Missing/invalid keys stop the process and the error names the keys, never the values.
- Secrets (session encryption keys) only from the environment / secret store. `.env*` never committed; `.env.example` lists keys only.
- Shared schemas: `@nile/config/env`. Per app: `src/lib/env/public.ts` (literal `process.env.NEXT_PUBLIC_*` reads, required for inlining), `src/lib/env/server.ts` (`server-only`, `serverEnv()`), validation at startup in `src/instrumentation.ts` and at build in `next.config.ts` (design 01 R-7…R-11). An empty value counts as missing; `NODE_ENV` is never put in env files.
- New env key: add it to the schema, the app's `.env.example`, `scripts/dev-env.mjs` and design 01 §9 in the same change.

## 12. Testing and CI

- Unit (Vitest): `packages/*` logic. Component (Vitest + Testing Library + MSW): every form, list and status-driven action. Contract: real backend responses parsed with strict schemas from the corrected snapshot (`npm run test:contract`, `packages/api/contract`; CI `contract.yml`). E2E (Playwright + axe, `npm run e2e` after `npm run build`): every workflow in `docs/frontend/workflows.md` by the end of its phase.
- Mock HTTP with `mockApi(method, path, ({ reply }) => reply.ok(data))` from `@nile/test-utils` (path and data are typed by the snapshot); render with `renderWithProviders` from `@nile/test-utils/react`; DTO factories via `defineFactory<'Dto'>()`, added with the first test that needs one.
- Every new screen: tests for happy path, validation failure, server-error mapping and authorization state. Every bug fix comes with a regression test.
- CI on every PR: `npm ci` → lint → format check → type-check → OpenAPI drift check (from T-B3) → unit/component → build → E2E smoke (from phase d) → `npm run audit`. Red CI blocks merge.
- `npm run audit` fails on high/critical advisories in runtime **and** dev dependencies, except entries in `audit-exceptions.json`, each with a reason and a `reviewBy` date; an expired exception fails too. Add an exception only when no fixed version exists and the code path is not reachable in production; say so in the PR.
- Definition of Done: `docs/frontend/implementation-plan.md` §0.1.

### 12.1 Git workflow (decided 2026-10-14)
- **One branch per phase** of the implementation plan: `phase/<letter>-<name>` (`phase/b-foundation`, `phase/c-design-system`, `phase/d-authentication`, `phase/e-catalog`, `phase/f-cart-checkout`, `phase/g-orders-account`, `phase/h-seller-admin-agent`, `phase/i-hardening-release`).
- Inside a phase branch: one or more commits per task, message `<type>(<scope>): T-xx <summary>` (e.g. `feat(foundation): T-B1 workspace scaffold`), ending with the attribution line.
- A phase reaches `main` through one pull request after the phase is reviewed. The next phase branches from `main` once the previous one is merged; if it isn't merged yet, it is stacked on the previous phase branch and its PR targets that branch.
- No direct commits to `main`. Commit and push only when the user asks.

## 13. Local environment notes

- First time (and after new env keys): `npm run dev:env` writes `apps/*/.env.local` (git-ignored; `-- --force` regenerates).
- `npm run dev` starts all four apps (4100–4103); `npm run dev -w @nile/<app>` starts one. Ctrl+C stops them all. If the launcher is killed hard (IDE stop button), servers keep running: `npm run dev:stop` stops the ones from this repository only.
- Repository scripts run npm through `process.env.npm_execpath` with argument arrays (no shell); run them through `npm run`, not `node scripts/...`.

- Windows reserves TCP ports 2978–3077 (and others) on this machine, so the backend's port 3000 is blocked; the ranges can change after a reboot (`netsh interface ipv4 show excludedportrange protocol=tcp`). To run the backend API on another host port without changing backend files: `docker compose run -d --rm --no-deps -p 3100:3000 api` from the backend repo (Postgres, Redis, RabbitMQ and Mailpit started first).
- Backend helpers for local and E2E work: `npm run seed:dev` (sample data), Mailpit at `http://localhost:8025` (OTP and invite emails), `PAYMENT_GATEWAY=fake` + `npm run dev:kashier-webhook` (signed Kashier webhooks).
- E2E runs need `ACCESS_TOKEN_TTL_MINUTES=2` in the backend's own `.env` (session refresh test, design 01 R-21).
- Card payment E2E (T-F4) needs the backend with `PAYMENT_GATEWAY=fake`, `NILE_BACKEND_DIR` in the shell (the built backend checkout, whose `scripts/dev-kashier-webhook.js` signs the webhook; skipped without it), and `KASHIER_PAYMENT_TTL_MINUTES=1` in the backend's `.env` for the expired path (skipped with a longer window) (design 01 R-33).
- Contract and E2E runs need `NILE_API_BASE_URL`, `MAILPIT_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD` in the shell, and a test admin seeded once in the backend (`docker compose run --rm --no-deps api node dist/seed-admin.js --email e2e-admin@example.test`; the first run accepts its invite with `E2E_ADMIN_PASSWORD`). The backend allows about 10 sign-ups/sign-ins per 5 min per IP locally: raise `RATE_LIMIT_STRICT_AUTH_POINTS` in the backend's own `.env` for repeated runs (design 01 §12.3).
- Backend env values the web apps rely on locally: `INVITE_URL_BASE=http://localhost:4100/invite`, `KASHIER_REDIRECT_URL=http://localhost:4100/checkout/payment-return` (to be set by the user in the backend's `.env`).

## 14. Decisions log and open items

### 14.1 Decided (2026-10-14, discovery)
FQ-1 monorepo, one Next.js app per role · FQ-2 agent web app in scope · FQ-4 English only, LTR, `Africa/Cairo`, `en-EG` formats · FQ-5 tokens proposed in phase c for approval · FQ-6 login required at "Add to cart", return to the product with variant and quantity preselected, no client cart · FQ-7 catalog server-rendered for SEO · FQ-9 dependency set (architecture §11.1) · FQ-10 logs only until hosting is chosen · FQ-11 own git repo, `main`, created in T-B1 · BFF session with encrypted httpOnly cookie (architecture §5) · neutral storefront `/invite` landing (architecture §5.7) · `openapi-typescript` + `openapi-fetch` with a correction script (architecture §6) · dev ports 4100–4103.

### 14.1b Decided (2026-10-14, specs)
Spec 00 conventions v1.0 and spec 01 storefront v1.0 approved with every recommendation (SF-Q-1…SF-Q-12): home = search + top-level categories + 12 newest · seller products via `/search?seller=` · stock shown as In/Out of stock only · no default payment method · 15-min window as a config constant · no sitemap in R1 · single-page checkout · minimal footer · product route accepts id or slug · brand "Nile" · SF-04 URL names · "Buy again" on cancelled orders (sequential adds, per-item results).

Spec 02 seller v1.0 approved with every recommendation (SE-Q-1…SE-Q-8): overview = status + 5 orders to confirm + 5 returns + balance + shortcuts · products in a deactivated category show "Unavailable category" and block new variants · stock "set count to" helper stated as a delta · one variant at a time with "Save and add another" · order tabs as SE-14 · no packing slip · new variants default Active · `sellerNet` shown in lists.
Spec 03 admin v1.0 approved with every recommendation (AD-Q-1…AD-Q-9): dashboard of five work queues · history actors as role + "you" + admin email · agent/seller names fetched per unique id on the visible page, cached 5 min · no customer suspension / agent invite resend (OQ-7) · summary confirmation for money actions · rates entered as percent (2 decimals) · payout `paidAt` as Cairo date-time, default now · desktop-first · category tree + details panel.
Spec 04 agent v1.0 approved with every recommendation (AG-Q-1…AG-Q-6): "handed back" shown by inference from attempts (no refused attempt and < 3 attempts), refusal handled gracefully, backend asked later for `sellerOrderCancelledAt` · COD confirmed by tick box with the API amount · "Open in maps" on tap · no offline/installable app · tabs To pick up / To deliver / Returns · mobile layout centred on desktop.
Design 01 and 02 v1.0 approved with every recommendation (DQ-1…DQ-9): packages consumed as source via `transpilePackages` · shadcn/ui dependencies approved · `SESSION_COOKIE_SECURE=false` in development only · no Server Actions for data mutations · own `@nile/logger` · CI pulls the backend with a read-only `BACKEND_REPO_TOKEN`, pinned in `backend.lock.json` · scope `@nile/*` · BFF timeout 15 s, body 64 KB, refresh skew 60 s · async-balance note on finance screens.

### 14.1c Decided (2026-10-14, T-B6)
`UserStatus` labels: Email not verified / Invited / Active / Suspended · admin neutral wording: seller order Awaiting payment / Placed (awaiting seller) / Accepted / Ready for pickup / Picked up / Out for delivery / Delivery attempt failed / Returning to seller / Returned to seller / Delivered / Cancelled; order as spec 01 §7.1 except Completed / Partially completed; payment as spec 01 §7.3 · domain enums checked against generated types by type-only test files (`@nile/api` devDependency, design 01 R-15) · error-code message map deferred to phase d.

### 14.1d Decided (2026-10-14, T-B7)
Contract validators from the corrected snapshot with Zod `fromJSONSchema`, objects closed (no new dependency) · test-utils delivers the mechanisms (typed `mockApi`, `defineFactory`, `renderWithProviders`), DTO factories come with their first tests · Playwright: per-role account fixtures through the backend + Mailpit and one axe smoke per app; browser-login fixtures and the CI E2E job in phase d · `contract.yml` on PRs touching `packages/api`/`packages/test-utils`/`backend.lock.json`, nightly and on demand, with the `BACKEND_REPO_TOKEN` secret.

### 14.1e Decided (2026-10-14, T-C1)
FQ-5 design tokens approved as on the storefront token page (`packages/ui/src/tokens.ts`): Nile blue `#0B5C7A` primary, slate neutrals, shadcn-named semantic colours with tested contrast, Inter (self-hosted), 4 px spacing, radii 4/6/8/12 px, four shadow levels, light theme only · token page at storefront `/design/tokens` (TC-1).

### 14.1f Decided (2026-10-14, T-C2)
Toasts on Radix Toast (no `sonner`) · Select now, searchable Combobox deferred to the first screen that needs it (dependency decided then) · own DataTable (no `@tanstack/react-table`): API sort values, load more, no totals · badge tone by what the user must do (warning waiting, success done, destructive failed/blocked, neutral closed/inactive, info in progress) · pagination is "Load more" only (conventions §7).

### 14.1g Decided (2026-10-14, T-C3)
One placeholder page per navigation destination (`PlaceholderScreen` naming the task that builds it), so links stay type-checked · static stand-ins for data-driven header parts (categories drawer, signed-out account links, seller business name/status, disabled agent shift switch) until their phases.

### 14.1h Decided (2026-10-14, T-D1)
Auth and BFF routes answer in the backend envelope (`WRONG_APP` role in `details[0].value`) · backend unreachable → `502 NETWORK_ERROR` · non-JSON body → `415 VALIDATION_FAILED` · T-D1 ships `login`/`refresh`/`logout` only; `verify-email`, `invite`, `password-change` come with T-D4/T-D6/T-D7 (design 01 R-20).

### 14.1i Decided (2026-10-14, T-D2)
E2E refresh test runs with the backend's `ACCESS_TOKEN_TTL_MINUTES=2` (skipped with a longer TTL) · only a 401 from `/api/auth/refresh` ends the session; network/429/5xx keep it · on sign-out or session end every tab clears private data; protected pages go to login, storefront public pages reload in place (design 01 R-21).

### 14.1j Decided (2026-10-14, T-D3)
`proxy.ts` decrypts the session cookie (no network call) and deletes an unusable one, so a stale cookie can't loop (design 01 R-22) · user sign-out goes to the storefront home / portal sign-in (conventions §2) · every protected page calls `await requireSession()` (checked by a test per app).

### 14.1k Decided (2026-10-14, T-D4)
Resend cooldown starts on arrival only after a code was just sent (`sent=1`); from sign-in a code is offered at once · the storefront header account area (`GET /me` island, menu with Sign out) is built in T-D4 · a security review found `returnTo` accepting `/.//evil.test`; the normalised path is now checked too (design 01 R-22, R-23).

### 14.1l Decided (2026-10-14, T-D5)
Sign-in screens shared in a new package `@nile/auth-screens` (apps give routes, sites, API calls, navigate and Link through a provider; registration forms stay per app) · seller portal shows the live business name, status badge and status banner from `GET /seller/profile` from T-D5 on; Overview content stays phase h (design 01 R-24).

### 14.1m Decided (2026-10-15, T-D6)
Invite acceptance on the storefront `/invite` with the session revoked at once and no cookie · admin/agent wrong-app wording per specs 03/04 (no link) · admin shell shows the signed-in email and Sign out; agent Sign out on the `/me` placeholder until T-H12 · E2E test admin `e2e-admin@example.test` (password reset by the app's own flow on 2026-10-15; value given to the user) (design 01 R-25).

### 14.1n Decided (2026-10-15, T-D7)
One shared security screen (change password, sign out) in all four apps; the session survives its own password change; agent `/security` linked from the Me placeholder (design 01 R-26).

### 14.1o Decided (2026-10-15, T-E1)
Home page split: T-E1 builds search + "Shop by category", T-E2 fills "New arrivals" · desktop categories menu is a two-level dropdown, phones keep the expandable drawer (design 01 R-27).

### 14.1p Decided (2026-10-15, T-E2)
Spec 01 v1.1: the home page has no search box of its own (the header's is on every page) · one URL ⇄ API mapping module for listings; invalid URL values dropped, never sent; filter changes navigate (Back restores) with the previous results dimmed; product route `/p/[idOrSlug]` per spec 01 (design 01 R-28).

### 14.1q Decided (2026-10-15, T-E3)
Signed-in "Add to cart" stays disabled with the T-F1 note until the cart write exists · selection mirrored to `?variant=` without a navigation · constants shared with Server Components never live in `'use client'` modules (design 01 R-29).

### 14.1r Decided (2026-10-15, T-F1)
Cart shown is always the last `CartDto` from the API (totals never recomputed); adds are never retried, an ambiguous failure refetches; quantity saved 500 ms after the last change; checkout only without issues (design 01 R-30).

### 14.1s Decided (2026-10-15, T-F2)
Checkout always refetches governorates (fees feed the total); empty cart or `hasIssues` sends back to `/cart` (with a notice for issues); non-deliverable addresses shown but disabled; default preselected only when deliverable; the first address becomes the default (spec 04 C-3); address form shared with T-G2 (design 01 R-31).

### 14.1t Decided (2026-10-15, T-F3)
`useIdempotentMutation` in `@nile/query` (design 01 §6.1) · card payment shown disabled until T-F4 · Place order errors per SF-07-A1 (cart codes back to `/cart` with notices, `ORDER_TOTAL_CHANGED` re-confirmed with a new key) · confirmation from `GET /orders/{id}` only (design 01 R-32).

### 14.1u Decided (2026-10-15, T-F4)
Card checkout leaves for Kashier only on `https:` URLs, after keeping the order id in `sessionStorage`; no URL or no session → the order page (Pay now) · return page decides only from `GET /orders/{id}` (3 s polling while visible, stops at a final state or 2 min after the window) · Pay now and Buy again built as shared pieces for SF-18 (design 01 R-33).

### 14.1v Decided (2026-10-15, T-G1)
Profile sends only changed fields, compared after normalisation; Save disabled without a change; email shown as text, not an input; `formatDate` added to `@nile/domain` (design 01 R-34).

### 14.1w Decided (2026-10-15, T-G2)
Address book edits send only changed fields (cleared optional → `null`, `isDefault` only `true`); one `AddressForm` for create and edit, shared with checkout; `ADDRESS_NOT_FOUND` → "This address no longer exists." + reload (design 01 R-35).

### 14.1x Decided (2026-10-15, T-G3)
Order tabs live in the URL as `?status=<tab>` (all / awaiting-payment / in-progress / completed / cancelled); the order detail refetches every 30 s only while awaiting payment; Kashier pieces moved to `features/orders/payment` so checkout → orders stays one-way (design 01 R-36).

### 14.1y Decided (2026-10-15, T-G4)
Cancel only when `canCancel`, idempotent with one key per intent, note optional and omitted when empty; "not cancellable" refetches and explains (design 01 R-37).

### 14.1z Decided (2026-10-15, T-H1)
Overview split: T-H1 builds the pending checklist and shortcuts, T-H4 the order lists, T-H5 the balance · what a seller may do comes from one helper (`sellerAccess` / `useSellerAccess`), and every seller write calls `useNotApprovedHandler` first · disabled controls stay visible with the banner's sentence · profile PATCH sends only changed fields, the pickup address always whole (design 01 R-38).

### 14.1aa Decided (2026-10-15, T-H2)
Category picker is the existing Select with full-path labels (`Fashion › Men`), any level; the searchable Combobox stays deferred · product list filters live in the URL (name search replaced after 400 ms) · variant create requires one option per attribute and disables combinations that exist · the last-active-variant consequence is confirmed before it happens (design 01 R-39).

### 14.1ab Decided (2026-10-15, T-H3)
`features/stock` stays independent of `products` (products hosts the dialog and history page) · the stock is re-read every time the dialog opens and "set to" works from that read · the effect sentence is computed from the delta that is sent · a definite refusal (`STOCK_ADJUSTMENT_INVALID`) starts a new idempotency intent, a network failure reuses the key (design 01 R-40).

### 14.1ac Decided (2026-10-15, T-H4)
`/orders` opens on "To confirm" · no date filter on seller orders in R1 · actions only as `sellerOrderActions(status)`, allowed for approved and suspended sellers · confirm and ready are never retried (no key in the API); cancel, item cancel and return received reuse their key · the Overview lives in `features/overview` and composes profile and orders (design 01 R-41).

### 14.1ad Decided (2026-10-15, T-H5)
No date filter on the seller statement in R1 · an unexpected ledger entry type on a seller statement is shown raw and reported with `console.warn` (type and id only) until T-I4 brings a client log sink · finance data is read on every visit, never polled (DQ-9) (design 01 R-42).

### 14.1ae Decided (2026-10-15, T-H6)
Admin Dashboard split per task: T-H6 builds the frame and `QueueCard`, each of T-H7, T-H9, T-H10 and T-H11 adds its queue · "Suspend" is never offered on the signed-in admin's own row (session user id passed from the server page) · the admin app uses the seller app's test harness and form/query packages (design 01 R-43).

### 14.1af Decided (2026-10-15, T-H7)
Admin sellers list opens on Pending (oldest first) and has the created date range as specified (Cairo days via `cairoDayBounds` in `@nile/domain`) · rates are typed as percents (`fields.percentRate`) and sent as fractions with decimal arithmetic · seller status-history actors: registration and re-apply are the seller, every other change an admin [VERIFIED backend] · AD-05 links to `/finance/accounts?owner=&type=` for T-H11 to honour (design 01 R-44).

### 14.1ag Decided (2026-10-15, T-H8)
Category editor as tree + panel with the selection in the URL (`?category=`) · the tree is read again after every write · "Add subcategory" hidden at depth 3 and disabled under an inactive category; activation disabled under an inactive parent · attribute and option codes never editable · default sort order one after the largest sibling (design 01 R-45).

### 14.1ah Decided (2026-10-16, T-H9)
Agent keys owned by `features/lookups` (names per unique id 5 min, picker, assignable) so one prefix refreshes every agent view · assign dialog: active agents minus the current one, pickup governorate + on shift first, one "Assign to" button each · `AGENT_HAS_ACTIVE_SHIPMENTS` links to the in-page active shipments · AD-11 finance shortcuts `/finance/remittances?agent=` and `/finance/payouts?payeeType=agent&payeeId=` for T-H11 to honour · AD-15 placeholder page so AD-13 links are typed · shared admin `FormDialog` (design 01 R-46).

### 14.1ai Decided (2026-10-16, T-H10)
OQ-16: admin seller-order cancel reasons Cancelled by the customer / Cancelled by the seller / Not confirmed within 24 hours / Card payment failed / Card payment not completed · order number searched exactly on "Find" · refund reasons filtered with a checkbox group (`reason[in]`) · one refunds table with Record on AD-15, AD-16, AD-17, idempotency key per refund + reference · AD-15 "Ledger entries" → `/finance/lookup?referenceType=seller_order&referenceId=` for T-H11 to honour (design 01 R-47).

### 14.1aj Decided (2026-10-16, T-H11)
Payee search on AD-21 is a search field with a result list and "Choose" buttons (no Combobox dependency; the searchable Combobox stays deferred) · money actions in two steps (form → summary) with one idempotency key per body · `*_EXCEEDS_BALANCE` reads the balance again (never parsed from the message) · paid at as Cairo `datetime-local`, sent as UTC ISO, future refused before sending · the parameter names fixed by the T-H7/T-H9/T-H10 links are honoured (design 01 R-48).

### 14.1ak Decided (2026-10-16, T-H12)
Agent app gets the admin app's test harness and approved form/query packages · every screen but Me waits for the profile and shows the inactive message instead of content; any `AGENT_INACTIVE` re-reads the profile · "Open in maps" is the universal Google Maps search link, opened only by the agent's tap · COD delivery sends the API amount after a required tick box; an amount change makes a new intent · active list tabs in the URL (`?tab=`) (design 01 R-49).

### 14.1al Decided (2026-10-16, T-I1)
CSP enforced after a report-only run: scripts nonce-only with `'strict-dynamic'`, styles `'self' 'unsafe-inline'` (Radix inline styles, by the §10 rule), `form-action 'self'` (Kashier not needed), no `upgrade-insecure-requests` · Zod runs `jitless` (no `eval` under the CSP) · static headers from `next.config.ts` on every path, `X-Frame-Options: DENY` added · every E2E test fails on a CSP violation (design 01 §10, R-50).

### 14.1am Decided (2026-10-16, T-I2)
`axe-core` (4.13.0) in `@nile/test-utils`: axe runs after **every** component test on the screen as the test left it and fails on serious/critical violations · keyboard-only E2E spec per role (`e2e/<app>/keyboard.spec.ts`, helpers in `e2e/fixtures/keyboard.ts`) · screen-reader spot checks by a person with `docs/frontend/a11y-screen-reader-checklist.md` (design 01 R-51).

### 14.2 Deferred
FQ-3 hosting · FQ-8 domains (both block only deployment, T-I5).

### 14.3 Still open

| # | Topic | Options / recommendation |
|---|---|---|
| OQ-1 | Backend sees the BFF's IP for every web user (shared rate limits) | Rec: trusted client-IP header + shared secret, honoured by the backend only for rate-limit keys (api-inventory §10.4). Backend change; **blocks production** |
| OQ-2 | Kashier return URL | Rec: `<storefront>/checkout/payment-return` (env value in the backend) |
| TC-1 | Storefront design pages `/design/tokens` and `/design/components` are served in every build (not linked, `noindex`) | Remove or gate it before release (T-I) |

| TB-1 | ESLint 10 | Stay on ESLint 9.39.5 (npm marks it unsupported) until `eslint-config-next` supports ESLint 10: tested 2026-10-14, its bundled `eslint-plugin-react` crashes on ESLint 10 (`contextOrFilename.getFilename is not a function`). Dev-only tooling. Re-check on each Next.js upgrade |
| SF-JSONLD | Spec 01 SF-05 [PROPOSED] asks for JSON-LD `Product`; the usual way is a `<script type="application/ld+json">` with `dangerouslySetInnerHTML`, which CLAUDE.md §7 forbids with API data | Rec: allow one exception: JSON-LD built from typed fields, `JSON.stringify` with `<` escaped as `\u003c`, in one reviewed helper. Alternative: drop JSON-LD from SF-05 |
| TB-3 | `@nile/config/env` is one module: browser bundles that read public settings also carry the server env *schema* (key names and rules, no values) | Rec: split into `env/public` and `env/server` entry points (small change) |
| TB-2 | `unrs-resolver` install script (npm install-script approval) | Left unapproved: lint and import resolution work without it. Approve only if a resolver error appears |

New ones go here as rows. When a decision is made, move it to §14.1.

## 15. Where things are

| Document | Purpose |
|---|---|
| `docs/frontend/api-inventory.md` | Backend contract as seen by the frontend: endpoints, errors, enums, OpenAPI defects, gaps |
| `docs/frontend/workflows.md` | What each role can do with the current API |
| `docs/frontend/architecture.md` | Architecture, auth, API client, structure, testing, guidelines, decisions |
| `docs/frontend/implementation-plan.md` | Phased tasks with acceptance criteria and DoD |
| `docs/frontend/spec/` | Business/screen specs per app: the source of truth for frontend behaviour once approved |
| `docs/frontend/design/` | System design: packages, session and BFF, data flow, config, CI (`01`); allow-lists, query keys, mutations (`02`). Code must follow it once approved |
| `docs/frontend/a11y-screen-reader-checklist.md` | Screen-reader spot checks (NVDA, VoiceOver) to perform and record |
