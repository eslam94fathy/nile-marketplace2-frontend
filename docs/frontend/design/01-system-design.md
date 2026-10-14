# Design 01 — System design

Status: **v1.0 APPROVED (2026-10-14).** Approved by the user with every recommendation in `01-system-design.md` §14 (DQ-1…DQ-9). Changes after approval need explicit approval and a version bump.
Inputs: `CLAUDE.md`, `docs/frontend/architecture.md` v0.2, specs `00`–`04` v1.0 (APPROVED), `api-inventory.md` v0.2, backend `4ad89a6`.
Companion: `02-data-layer.md` (BFF allow-lists, query keys, mutations and invalidation per app).

This document turns the approved architecture and specs into concrete modules, interfaces, flows and configuration. Where it refines `architecture.md` it says so (§13). Design questions are in §14.

---

## 1. Runtime topology

```
                         ┌──────────── apps/<app> (Next.js, Node runtime, one process per app) ─────────────┐
Browser ── HTTPS ───────►│ proxy.ts ── CSP nonce, security headers, optimistic session redirect              │
 (cookies:               │ app/ (RSC pages) ── lib/server-api.ts ──────────────┐                              │
  __Host-…_session,      │ app/api/auth/[action]/route.ts ── @nile/auth ───────┼──► NILE_API_BASE_URL/api/v1  │
  __Host-…_sv)           │ app/api/bff/[...path]/route.ts ── @nile/auth proxy ─┘    (Bearer only)             │
                         │ client components ── @nile/query + @nile/api (browser transport → /api/bff)       │
                         └───────────────────────────────────────────────────────────────────────────────────┘
```

- Four independent Next.js apps (`storefront` 4100, `seller` 4101, `admin` 4102, `agent` 4103), each its own origin, cookie jar, CSP and deploy unit.
- No server-side state outside the encrypted cookie: no database, no Redis, no in-memory session store. Any instance can serve any request.
- Every app talks to one backend base URL (`NILE_API_BASE_URL`). Browsers never talk to the backend.

## 2. Packages and their public interfaces

Scope `@nile/*`, workspace packages, TypeScript source consumed directly by the apps (Next.js `transpilePackages`), no separate build step [PROPOSED, DQ-1].

| Package | Depends on | Imports React/Next? | Public interface (index.ts) |
|---|---|---|---|
| `@nile/api` | `openapi-fetch` | no | `createApiClient(transport)`, `ApiError`, `isApiError(e, ...codes)`, `ERROR_CODES`, `type ErrorCode`, generated `paths`/`components` types, `type Schema<'Name'>`, `listQuery()`, `productQuery()`, `unwrap()`; transports `serverTransport({ baseUrl, accessToken?, correlationId })`, `browserTransport({ bffBase, onUnauthenticated })` |
| `@nile/domain` | `decimal.js`, `zod` | no | `money` (`parseMoney`, `addMoney`, `formatMoney`, `rateToPercent`, `percentToRate`), `dates` (`formatDateTime`, `countdown`), `labels/*` (one exhaustive map per enum), `fields` (Zod: `email`, `egPhone`, `password`, `otp`, `money`, `positiveMoney`, `slug`, `trimmedString(min,max)`, `nullableTrimmedString`), `status/*` (display-only helpers, e.g. `sellerOrderActions(status)`) |
| `@nile/query` | `@tanstack/react-query` | React | `getQueryClient()`, `QueryProvider`, `keys` (factory, §6), shared `queryOptions` for public resources (`categoriesQuery`, `categoryAttributesQuery`, `governoratesQuery`), `infiniteListOptions()`, `useIdempotentMutation()`, `useApiErrorHandler()`, `applyServerErrors(form, error, fieldMap?)` |
| `@nile/auth` | `jose`, `@nile/api`, `server-only` (server entry) | Next (server entry) + React (client entry) | **server** (`@nile/auth/server`): `createSessionCookie(config)`, `readSession()`, `requireSession(role)`, `createAuthRouteHandler(appConfig)`, `createBffRouteHandler(appConfig)`, `createProxyMiddleware(appConfig)`; **client** (`@nile/auth/client`): `SessionProvider`, `useSessionUser()`, `refreshCoordinator`, `SessionExpiredBoundary`, `signOut()` |
| `@nile/ui` | shadcn/ui deps (Radix, `class-variance-authority`, `tailwind-merge`, `lucide-react`) | React | Components (`Button`, `Field`, `Input`, …, `DataList`, `LoadMore`, `StatusBadge`, `Money`, `DateTime`, `Countdown`, `ConfirmDialog`, `Toaster`), `theme.css`, `cn()` |
| `@nile/logger` | – | no | `createLogger({ app, level })` → `ILogger` (`fatal/error/warn/info/debug`, `child()`), JSON lines, redaction list (§11) [PROPOSED, DQ-5] |
| `@nile/config` | – | – | `tsconfig/*.json`, ESLint flat config, Prettier, Vitest presets |
| `@nile/test-utils` | `msw`, Testing Library | React | typed MSW `http` helpers (`mockApi('get', '/orders/{orderId}', …)`), factories per DTO, `renderWithProviders()`, Mailpit and Kashier-webhook helpers for E2E |

`shadcn/ui` brings its usual small dependencies (Radix primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`); they come with the shadcn choice you made, and are listed here so they're explicit (DQ-2).

### 2.1 Dependency rules (ESLint `import/no-restricted-paths` + `no-restricted-imports`)

```
apps/*  ──► @nile/ui, @nile/query, @nile/auth, @nile/domain, @nile/api, @nile/logger
@nile/ui ──► @nile/domain
@nile/query ──► @nile/api, @nile/domain
@nile/auth ──► @nile/api, @nile/logger
@nile/api, @nile/domain, @nile/logger ──► (no workspace package)
```

- Client components may not import `@nile/auth/server`, `@nile/logger`, or any `apps/*/src/lib/server/*` (enforced by `server-only`).
- Inside an app: `app/` imports `features/*/index.ts` only; features import each other only through `index.ts`.

## 3. Session

### 3.1 Cookies

| Cookie | Attributes | Content |
|---|---|---|
| `__Host-nile_<app>_session` | `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age = refreshTokenExpiresAt − now` | Compact JWE (`alg: dir`, `enc: A256GCM`, `kid` header) of the session payload |
| `__Host-nile_<app>_sv` | `Secure; SameSite=Lax; Path=/` (readable by JS) | `accessTokenExpiresAt` as epoch milliseconds — no secret |

Session payload (`SessionV1`):
```ts
interface SessionV1 {
  v: 1;
  accessToken: string; accessTokenExpiresAt: string;     // ISO
  refreshToken: string; refreshTokenExpiresAt: string;   // ISO
  user: { id: string; email: string; role: UserRole; status: UserStatus };
  issuedAt: string;                                      // when the BFF wrote it
}
```
- Size: ≈ 1.1 KB encrypted (JWT ~ 600 B + 43 B refresh + metadata) — well under the 4 KB cookie limit.
- Keys: `SESSION_ENCRYPTION_KEYS` = JSON `{ "<kid>": "<base64 32 bytes>" }`, `SESSION_ACTIVE_KEY_ID`. Decrypt tries the `kid` from the header only; unknown `kid` or failed decryption → treated as **no session** (cookie cleared). Rotation: add a key, switch the active id, remove the old key after 30 days (the refresh-token lifetime).
- Development over `http://localhost`: `SESSION_COOKIE_SECURE=false` drops `Secure` and the `__Host-` prefix (names become `nile_<app>_session`); the env schema rejects `false` when `NODE_ENV=production` (DQ-3).

### 3.2 `readSession()` / `requireSession(role)`

- `readSession()` (server only; wrapped in React `cache()` per request): decrypt → validate shape with Zod → return `{ user, accessToken, accessTokenExpired: boolean }` or `null`.
- `requireSession(role)`: `null` or `user.role !== role` → `redirect('/login?returnTo=…')` in pages; `ApiError('UNAUTHENTICATED', 401)` in route handlers.
- `SessionProvider` receives only `user` (id, email, role, status) from the root layout; tokens never cross to the client.

## 4. BFF route handlers

### 4.1 Auth routes — `app/api/auth/[action]/route.ts`

All `POST`, JSON, CSRF-checked (§4.3), `Cache-Control: no-store`. They return no tokens, ever.

| Action | Apps | Backend call(s) | Effect | Response |
|---|---|---|---|---|
| `login` | all | `POST /auth/login { email, password, deviceName }` | role check → wrong role: `POST /auth/logout` with the new refresh token, no cookie, `403 { code: 'WRONG_APP', role }`; else write session + `sv` | `200 { user }` |
| `verify-email` | storefront, seller | `POST /auth/email/verify` | same role check; write session | `200 { user }` |
| `refresh` | all | `POST /auth/refresh` **only if** the access token expires in < 60 s (`REFRESH_SKEW_SECONDS`) | write session; on `INVALID_REFRESH_TOKEN` clear cookies | `200 { accessTokenExpiresAt }` or `401 { code: 'INVALID_REFRESH_TOKEN' }` |
| `logout` | all | `POST /auth/logout { refreshToken }` (errors ignored; always 204 upstream) | clear cookies | `204` |
| `password-change` | all | `POST /auth/password/change { currentPassword, newPassword, refreshToken }` with Bearer | session unchanged | `204` or the backend error |
| `invite` | storefront | `POST /auth/invite/accept { token, password }` → read `user.role` → `POST /auth/logout { refreshToken }` | **no cookie** (spec 01 SF-20) | `200 { role, email }` |

- `WRONG_APP` is a BFF-only code (not a backend code); it is added to the client error catalogue with that note.
- Login and verify forward the client's `X-Correlation-Id`; all upstream errors are passed through unchanged (same envelope, same status, `Retry-After` forwarded).

### 4.2 Proxy route — `app/api/bff/[...path]/route.ts`

Request pipeline (in order):
1. Method ∈ `GET, POST, PATCH, PUT, DELETE`; others → `405`.
2. CSRF check for non-`GET` (§4.3).
3. Match `METHOD /path` against the app's **allow-list** (`02-data-layer.md` §1; path templates compiled to regexes, ids must be UUID-shaped, `idOrSlug` slug-shaped). No match → `404 ROUTE_NOT_FOUND` (same envelope as the backend).
4. Body: only `application/json`, max `BFF_MAX_BODY_KB` (proposed 64); else `413 PAYLOAD_TOO_LARGE`.
5. Session: operations marked "Bearer" need a session (none → `401 UNAUTHENTICATED`; access token already expired → `401 UNAUTHENTICATED` **without calling the backend**, so the client refreshes first). Public operations send no `Authorization` even when a session exists [PROPOSED: keeps public responses user-independent].
6. Forwarded request headers (allow-list): `Content-Type`, `Accept`, `Idempotency-Key`, `X-Correlation-Id` (generated if absent). Nothing else — no cookies, no client `Authorization`, no `X-Forwarded-*` (OQ-1).
7. Upstream `fetch` with `BFF_UPSTREAM_TIMEOUT_MS` (proposed 15 000); timeout → `504 { code: 'UPSTREAM_TIMEOUT' }` (BFF-only code, treated like a network error; idempotent calls retry with the same key).
8. Response: status and JSON body passed through unchanged; forwarded response headers: `Content-Type`, `Retry-After`, `X-Correlation-Id`, `Idempotent-Replayed`; plus `Cache-Control: no-store`.
9. One log line per request (§11): method, path **template**, status, duration, correlation id, user id — never body, query values or headers.

### 4.3 CSRF check (all non-GET BFF routes)

- `Origin` header must equal `APP_ORIGIN` exactly (missing `Origin` → reject).
- Header `X-Nile-Client: 1` must be present (set by the browser transport; a cross-site form can't add it).
- Failure → `403 { code: 'CSRF_REJECTED' }` (BFF-only code), logged at `warn`.
- Server Actions are **not used** for data mutations [PROPOSED, DQ-4]: one mutation path (TanStack → `/api/bff`) keeps CSRF, idempotency, error mapping and logging in one place.

### 4.4 `proxy.ts` (Next.js 16 request proxy)

Per request, for page routes (excluding `/api/*`, `/_next/*`, static files):
1. Generate a CSP nonce; set `Content-Security-Policy` and the static security headers (§10).
2. Protected route prefixes (per app config): no session cookie → redirect `/login?returnTo=<path+query>`. **Cookie presence only**, no decryption (cheap, optimistic); real checks happen in the DAL.
3. Auth pages (`/login`, `/register`) with a session cookie present → redirect to the app home (or `returnTo`).

## 5. Data access

### 5.1 Server side (RSC)

`apps/<app>/src/lib/server/api.ts`:
```ts
export const serverApi = cache(async () => {
  const session = await readSession();          // may be null (public pages)
  return createApiClient(serverTransport({
    baseUrl: env.NILE_API_BASE_URL,
    accessToken: session && !session.accessTokenExpired ? session.accessToken : undefined,
    correlationId: crypto.randomUUID(),
  }));
});
```
- Public catalog pages call it without a session and may use `next: { revalidate }` per spec (category tree 300 s); every other server call is `cache: 'no-store'`.
- A protected page whose session token is expired renders `<SessionExpiredBoundary/>` (client) instead of fetching: it runs the refresh flow (§5.3) then `router.refresh()`. Protected pages prefetch only where a spec requires server rendering; portal pages fetch on the client.

### 5.2 Client side

- `browserTransport` calls `/api/bff/<path>` with `credentials: 'same-origin'`, `X-Nile-Client: 1`, `X-Correlation-Id`.
- On `401 UNAUTHENTICATED`: `await refreshCoordinator.refresh()`; success → retry the original request **once** with the same headers (same `Idempotency-Key`); failure → `signOut({ reason: 'session-ended' })`.
- On `401 INVALID_REFRESH_TOKEN` from refresh: clear the query cache, broadcast logout, navigate to `/login?notice=session-ended&returnTo=…`.

### 5.3 Refresh coordinator (browser)

```
refresh():
  if inFlight: return inFlight                                  // same-tab single flight
  inFlight = navigator.locks
    ? navigator.locks.request('nile-<app>-refresh', doRefresh)  // cross-tab
    : doRefresh()                                               // fallback (+ BroadcastChannel notice)
doRefresh():
  exp = readCookie('nile_<app>_sv')                             // epoch ms
  if exp - now > SKEW: return 'fresh'                           // another tab already refreshed
  res = POST /api/auth/refresh (X-Nile-Client, Origin)
  200 → broadcast('refreshed'); return 'refreshed'
  401 → broadcast('signed-out'); throw SessionEnded
```
- Proactive timer: while the document is visible, schedule `refresh()` at `exp − 60 s`; on `visibilitychange` to visible, check immediately.
- `BroadcastChannel('nile-<app>-session')` messages: `refreshed`, `signed-out`. On `signed-out` every tab clears its cache and navigates to login.
- The server route (§4.1 `refresh`) independently skips the backend call when the token is fresh, so a stray second call can never present an already-rotated token.

### 5.4 Sequence: page load with an expired access token (portal)

```
Browser            Next (RSC)                 /api/auth/refresh            Backend
  │ GET /orders ──►│ readSession(): expired    │                            │
  │◄── HTML with <SessionExpiredBoundary/> ─────│                            │
  │ lock + sv check ──────────────────────────►│ token < 60 s → POST /auth/refresh ──►│
  │                                            │◄──────────────── 200 tokens ─────────│
  │◄──────────── 200 + Set-Cookie (session, sv) │                            │
  │ router.refresh() → GET /orders (RSC) ──► fetch with new token ─────────────────────►│
```

## 6. Server state (TanStack Query)

- `getQueryClient()`: server → new client per request (`cache()`d); browser → module singleton. Defaults: `staleTime` 30 s, `gcTime` 5 min, `retry(count, err)` → only `NETWORK_ERROR`/`UPSTREAM_TIMEOUT`/5xx and `count < 2`, `refetchOnWindowFocus: true`; mutations `retry: false`.
- Key factory (`@nile/query/keys`): `[scope, resource, kind, params?]`, e.g. `['storefront', 'orders', 'list', { status: ['placed','in_progress'] }]`, `['public', 'categories', 'tree']`. The `scope` segment (`public` or the app name) allows "clear everything private" on sign-out: `queryClient.removeQueries({ predicate: q => q.queryKey[0] !== 'public' })`.
- Each feature exports `queryOptions` factories; the full registry with stale times, polling and invalidation is in `02-data-layer.md` §2–§3.
- Infinite lists: `infiniteListOptions({ key, fetchPage })` with `initialPageParam: undefined` and `getNextPageParam: last => last.meta.hasMore ? last.meta.nextCursor : undefined`.
- Polling: `refetchInterval` only on the queries named in the specs, with `refetchIntervalInBackground: false`.

### 6.1 `useIdempotentMutation`

```ts
useIdempotentMutation({ mutationFn: (vars, key) => …, intentOf: vars => stableJson(vars) })
```
- Keeps `{ intent, key }` in a ref. `mutate(vars)`: same intent as the stored one → reuse the key; different → new `crypto.randomUUID()`.
- Clears the stored key after success, or when the user changes the input (the form calls `resetIntent()`).
- `IDEMPOTENCY_REQUEST_IN_PROGRESS` → automatic re-send with the same key after 1 s, max 3 (conventions §4).

### 6.2 Error handling pipeline

```
fetch → transport → ApiError{status, code, message, details, correlationId, retryAfter}
   ├─ forms:   applyServerErrors(form, err, fieldMap)   VALIDATION_FAILED → setError per field; else form alert
   ├─ screen:  useApiErrorHandler(overrides)             screen-specific map (specs) → default map (conventions §4)
   └─ global:  QueryCache/MutationCache onError          only logging + session-ended handling; no toasts here
```
- Copy for every code lives in `@nile/domain/labels/errors.ts`; screens override per spec.
- `retryAfter` (seconds) drives the `RATE_LIMITED` countdown hook `useRetryAfter(err)`.

## 7. Forms

- `useForm({ resolver: zodResolver(schema), mode: 'onBlur' })`; schemas in `features/<f>/schemas.ts`, composed from `@nile/domain/fields`.
- `toRequestBody(schema output, initialValues)` helper builds PATCH bodies with changed fields only, converts empty nullable inputs to `null` (edit) or omits them (create), per conventions §5.
- Type safety: `satisfies` checks against `Schema<'CreateAddressDto'>` etc. (after the OpenAPI fixes remove `__atLeastOneField`).

## 8. Rendering per app

| App | Server-rendered with data | Client-fetched | Revalidation |
|---|---|---|---|
| storefront | `/`, `/c/[slug]` (first page), `/search` (first page), `/p/[idOrSlug]`, not-found | header session island, cart badge, cart, checkout, account, payment return | category tree `revalidate: 300`; everything else dynamic `no-store` |
| seller, admin, agent | layouts and auth gates only | all data | dynamic `no-store` |

- Storefront catalog pages are rendered without reading the session (no cookies read → cacheable); the header island fetches `/me` and `/cart` client-side (spec 01 §2.2).
- Metadata (`generateMetadata`) and JSON-LD only on storefront catalog pages; every other route sets `robots: { index: false }`.

## 9. Configuration (env)

Validated by Zod at startup (`apps/<app>/src/lib/env.ts`), split server/public, no defaults, errors name keys only.

| Key | Scope | Apps | Example (dev) |
|---|---|---|---|
| `NODE_ENV` | server | all | `development` |
| `APP_ORIGIN` | server | all | `http://localhost:4100` |
| `NILE_API_BASE_URL` | server | all | `http://localhost:3100` |
| `SESSION_ENCRYPTION_KEYS` | server, secret | all | `{"k1":"<base64 32 bytes>"}` |
| `SESSION_ACTIVE_KEY_ID` | server | all | `k1` |
| `SESSION_COOKIE_SECURE` | server | all | `false` (dev only; `true` required in production) |
| `REFRESH_SKEW_SECONDS` | server | all | `60` |
| `BFF_UPSTREAM_TIMEOUT_MS` | server | all | `15000` |
| `BFF_MAX_BODY_KB` | server | all | `64` |
| `LOG_LEVEL` | server | all | `debug` |
| `NEXT_PUBLIC_APP_NAME` | public | all | `storefront` |
| `NEXT_PUBLIC_STOREFRONT_URL`, `NEXT_PUBLIC_SELLER_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_AGENT_URL` | public | all (cross-links, wrong-app messages, invite redirect) | `http://localhost:4100` … `4103` |
| `NEXT_PUBLIC_KASHIER_PAYMENT_WINDOW_MINUTES` | public | storefront | `15` (spec 01 SF-Q-5) |
| `NEXT_PUBLIC_REFRESH_SKEW_SECONDS` | public | all | `60` (client proactive refresh) |

Polling intervals and page sizes are code constants (specs fix them), not env.

## 10. Security headers (set in `proxy.ts` for pages, in route handlers for `/api/*`)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-{n}' 'strict-dynamic'; style-src 'self' 'nonce-{n}'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self' https://*.kashier.io; base-uri 'self'; object-src 'none'` (dev adds `'unsafe-eval'` for React refresh only) |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cache-Control` | `no-store` on every authenticated page and `/api/*` |

- `style-src`: nonce-based first. Server-rendered `style="…"` attributes (used by some Radix components) aren't covered by a nonce; if T-I1's report-only run shows violations, `style-src` gets `'unsafe-inline'` **for styles only** (scripts stay nonce-only). Inline styles can't execute code, so this is the accepted trade-off [ASSUMPTION, decided by evidence in T-I1].
- `form-action` includes Kashier only because navigation to the hosted page uses `window.location.assign` (not a form); kept for safety if Kashier redirects via a form [ASSUMPTION, verified in T-F4; removed if unnecessary].
- Fonts self-hosted via `next/font` (no third-party origins).

## 11. Logging and observability

- `@nile/logger`: JSON lines to stdout: `level, timestamp (ISO UTC), message, app, env, correlationId, userId?, route?, status?, durationMs?`. Redaction list: `authorization, cookie, set-cookie, accessToken, refreshToken, password, currentPassword, newPassword, otp, token, recipientPhone, phone, contactPhone, street, building, floor, apartment, landmark`.
- Logged: one line per BFF request (§4.2), auth events (`LOGIN_SUCCEEDED`, `LOGIN_WRONG_APP`, `REFRESH_FAILED`, `CSRF_REJECTED`) with user id only, unexpected server errors with stack.
- Browser errors: caught by `error.tsx` boundaries and shown with the correlation id; reported to a monitoring service only after FQ-10 (phase i).
- Correlation id: generated in the browser transport per request, forwarded by the BFF, echoed by the backend — the same id appears in the UI toast, the BFF log and the backend log.

## 12. Development, test and CI infrastructure

### 12.1 Local development

1. Backend (backend repo, unchanged files): `docker compose up -d postgres redis rabbitmq mailpit`, migrate, then the API on host port 3100 (`docker compose run -d --rm --no-deps -p 3100:3000 api`) and the worker; `npm run seed:dev`. Backend `.env` values the user sets: `INVITE_URL_BASE=http://localhost:4100/invite`, `KASHIER_REDIRECT_URL=http://localhost:4100/checkout/payment-return`, `PAYMENT_GATEWAY=fake`.
2. Frontend: `npm run dev` (all four apps in parallel) or `npm run dev -w apps/storefront`.
3. `npm run api:pull && npm run api:gen` when the backend contract changes.

### 12.2 Pinned backend version

`backend.lock.json` = `{ "repo": "eslam94fathy/nile-marketplace2", "commit": "<sha>", "openapiSha256": "<hash>" }`. The OpenAPI snapshot, contract tests and E2E all target this commit; bumping it is a reviewed PR (DQ-6).

### 12.3 E2E and contract test environment

- CI job checks out the backend at the pinned commit, `docker compose up` (fake payment gateway, Mailpit), migrates, seeds, starts the four apps in production mode, runs Playwright.
- Helpers in `@nile/test-utils/e2e`: `mailpit.latestOtp(email)`, `mailpit.latestInviteUrl(email)` (Mailpit HTTP API on 8025), `kashier.sendWebhook(orderId, outcome)` (wraps the backend's `npm run dev:kashier-webhook`), `api.asAdmin()` (direct backend calls for setup, e.g. approving a seller).
- Test data: each test creates its own users with unique emails (`e2e+<uuid>@example.test`); no shared mutable fixtures.

### 12.4 CI pipeline (GitHub Actions)

| Job | Runs on | Steps |
|---|---|---|
| `verify` | every PR / push to `main` | `npm ci` → lint → format check → type-check → `api:gen` drift check → unit + component tests (coverage) → build all apps → `npm audit --audit-level=high` |
| `contract` | PRs touching `packages/api`, nightly | backend at pinned commit → contract suite |
| `e2e-smoke` | every PR | backend at pinned commit → Playwright smoke set (one journey per role, Chromium) |
| `e2e-full` | nightly | full Playwright suite (Chromium, WebKit, mobile viewport) + axe |

## 13. Refinements of `architecture.md`

| # | Change | Reason |
|---|---|---|
| R-1 | TanStack helpers live in a new package `@nile/query` instead of `packages/api/src/react` | Keeps `@nile/api` free of React (boundary rule 2) |
| R-2 | New package `@nile/logger` (own minimal implementation, no dependency) | Structured BFF logs with redaction; mirrors the backend's approach |
| R-3 | Server Actions not used for data mutations | One mutation path through the BFF (§4.3) |
| R-4 | BFF proxy route path `/api/bff/[...path]`, auth routes `/api/auth/[action]` | Concrete names |
| R-5 | `verify-email` and `invite` are dedicated auth routes | They return tokens; the proxy must never pass tokens to the browser |
| R-6 | Public operations never carry a Bearer token, even with a session | User-independent public responses |
| R-7 | Env (T-B2): schemas in `@nile/config/env` (`serverEnvSchema`, `publicEnvSchema(app)`, `parseEnv`, `checkEnvConsistency`); an empty value counts as missing; `NODE_ENV` comes from Next.js, never from env files | One implementation for four apps; no silent defaults |
| R-8 | Validation points: public keys in `next.config.ts` (fails `next build`, `next dev` and `next typegen`) and at module load in the browser; server keys plus cross-checks in `instrumentation.ts` `register()` (fails server start with one JSON `fatal` line naming keys, never values) | Fail at boot, not on a request |
| R-9 | Cross-checks: `APP_ORIGIN` must equal the app's own `NEXT_PUBLIC_<APP>_URL`; `NEXT_PUBLIC_REFRESH_SKEW_SECONDS` ≤ `REFRESH_SKEW_SECONDS` | A larger browser skew would loop refresh calls the server answers as "still fresh" (§5.3) |
| R-10 | Production requires `SESSION_COOKIE_SECURE=true` only; origins are not forced to https by the schema | A production build must run on http://localhost under E2E (browsers accept Secure cookies there); real deployments are https by setup |
| R-11 | `npm run dev:env` writes git-ignored `apps/*/.env.local` (local values, a random session key per app); CI runs it before type-check and build | Mirrors the backend; `NEXT_PUBLIC_APP_NAME` differs per app, so one CI env block can't serve all apps |
| R-12 | Contract (T-B3): snapshot stored pretty-printed; `backend.lock.json` pins `{ repo, commit, openapiSha256 }` of that file; `openapi-fix.ts` uses its own plain-JSON document types and throws when a corrected target disappears; `openapi-typescript` 7.13 declares `typescript ^5` and is pointed at TypeScript 6 through a root `overrides` entry (generation and the output were verified under TS 6); scripts run as TypeScript directly on Node 24 (no `tsx`) | Reviewable diffs, reproducible types, no silent contract drift |
| R-13 | API client (T-B4): calls are `unwrap(api.GET(path, init))` → `{ data, meta }` or `ApiError`; the error catalogue is the 109 codes found in the backend source plus 4 client/BFF codes, `code` typed `ErrorCode | (string & {})` for newer codes; non-envelope answers and invalid success JSON become `NETWORK_ERROR` with the HTTP status kept; aborts are rethrown untouched; the browser transport rewrites `/api/v1/<path>` to `<bff>/<path>`, sets `X-Nile-Client` and a correlation id, strips any `Authorization`, and on `401 UNAUTHENTICATED` calls `onUnauthenticated()` once and retries the untouched request once (same `Idempotency-Key` and body); `Idempotency-Key` is required at compile time by the generated header types | One error model; retries can never double-submit |

## 14. Design questions (all answered 2026-10-14: the recommendation was accepted for each)

| # | Question | Options (recommendation first = decision) |
|---|---|---|
| DQ-1 | Packages: build step or source-consumed | **Source consumed by the apps via `transpilePackages`, no package build (Rec: simplest, fast HMR)** · each package built to `dist` |
| DQ-2 | shadcn/ui's own dependencies (Radix, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`) | **Approve as part of the shadcn/ui choice (Rec)** · review each |
| DQ-3 | Secure cookies on `http://localhost` | **`SESSION_COOKIE_SECURE=false` allowed in development only, rejected in production (Rec)** · local HTTPS with a dev certificate |
| DQ-4 | Server Actions | **Not used for data mutations; TanStack mutations through the BFF only (Rec)** · use Server Actions for forms |
| DQ-5 | Logger | **Own minimal `@nile/logger` (Rec)** · `pino` (new dependency) |
| DQ-6 | Backend access in CI (the backend repo may be private) | **Fine-grained read-only GitHub token as a repository secret `BACKEND_REPO_TOKEN`, backend pinned by commit in `backend.lock.json` (Rec)** · publish backend images to a registry and pull them |
| DQ-7 | Package scope name | **`@nile/*` (Rec)** · other |
| DQ-8 | BFF limits | **Upstream timeout 15 s, body 64 KB, refresh skew 60 s (Rec)** · other values |
| DQ-9 | Balances update asynchronously after a delivery (backend worker) | **Add the note "Balances update a few moments after a delivery." on seller and agent finance screens; refetch on visit, no polling (Rec)** · poll finance screens |
