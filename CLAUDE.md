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

- shadcn/ui components from `packages/ui` only; no ad-hoc copies in apps.
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

- Unit (Vitest): `packages/*` logic. Component (Vitest + Testing Library + MSW): every form, list and status-driven action. Contract: generated types parsed against the real backend (docker compose from the backend repo). E2E (Playwright + axe): every workflow in `docs/frontend/workflows.md` by the end of its phase.
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

### 14.2 Deferred
FQ-3 hosting · FQ-8 domains (both block only deployment, T-I5).

### 14.3 Still open

| # | Topic | Options / recommendation |
|---|---|---|
| OQ-1 | Backend sees the BFF's IP for every web user (shared rate limits) | Rec: trusted client-IP header + shared secret, honoured by the backend only for rate-limit keys (api-inventory §10.4). Backend change; **blocks production** |
| OQ-2 | Kashier return URL | Rec: `<storefront>/checkout/payment-return` (env value in the backend) |

| TB-1 | ESLint 10 | Stay on ESLint 9.39.5 (npm marks it unsupported) until `eslint-config-next` supports ESLint 10: tested 2026-10-14, its bundled `eslint-plugin-react` crashes on ESLint 10 (`contextOrFilename.getFilename is not a function`). Dev-only tooling. Re-check on each Next.js upgrade |
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
