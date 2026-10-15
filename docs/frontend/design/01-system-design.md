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
| `@nile/auth-screens` | `@nile/ui`, `@nile/query`, `@nile/domain`, `@nile/auth`, `@nile/api` | React (no Next.js) | `SignInForm`, `VerifyEmailForm`, `ForgotPasswordForm`, `ResetPasswordForm`, `AuthScreensProvider`, `AUTH_COPY`, `useSubmitFailure`, `FailureAlert`; `./params` (R-24) |
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
- Helpers in `@nile/test-utils/e2e` (as built in T-B7, R-16): `createAccounts()` → `admin()` (the seeded test admin, signed in once; on its first run it accepts its invite), `customer()`, `seller({ approved })`, `agent()`; `createMailpit(url).awaitEmail(to, kind, trigger)` (codes and invites, only emails newer than the trigger); `createBackend(url)` (raw requests that keep status and body). `kashier.sendWebhook(orderId, outcome)` arrives with checkout (phase f).
- Test data: each test creates its own users with unique emails (`e2e+<label>-<uuid>@example.test`); no shared mutable fixtures. Only the admin is shared: the backend creates the first admin with `seed-admin`, never through the API.
- Backend access-token lifetime for E2E: `ACCESS_TOKEN_TTL_MINUTES=2` (the refresh test waits for a real expiry; CI sets it in its stack).
- Card payments in E2E (T-F4, R-33): backend `PAYMENT_GATEWAY=fake` (checkout links to `https://fake-kashier.invalid`, intercepted by the test); `NILE_BACKEND_DIR` names the built backend checkout whose `scripts/dev-kashier-webhook.js` sends the signed webhook (paid path skipped without it); `KASHIER_PAYMENT_TTL_MINUTES=1` for the expired path (skipped with a longer window).
- Settings for both suites (no defaults, missing keys are named): `NILE_API_BASE_URL`, `MAILPIT_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`.
- Local run (backend stack as §12.1, API on 3100): once, `docker compose run --rm --no-deps api node dist/seed-admin.js --email e2e-admin@example.test` in the backend repo; then `npm run test:contract`, and `npm run build && npm run e2e` (needs `npx playwright install chromium` once). The backend's strict-auth limit (local default 10 per 5 min, per IP) allows about one suite run per window; raise `RATE_LIMIT_STRICT_AUTH_POINTS` in the backend's own `.env` for repeated local runs. CI sets it to 1000 for its throwaway stack.

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
| R-14 | Query foundation (T-B5): `@nile/query` holds `makeQueryClient`/`getQueryClient` (server: React `cache` per request; browser: singleton; detection via `environmentManager.isServer()`), the key factory and `clearPrivateQueries`, `infiniteListOptions`, the three public `queryOptions` and `QueryProvider` (devtools lazily loaded in development only; verified absent from production bundles). TanStack Query 5.104 deprecates `prefetchQuery`/`fetchQuery`/`fetchInfiniteQuery`/`isServer`: use `queryClient.query(options)` (`.catch(noop)` to prefetch without throwing) and `queryClient.infiniteQuery(options)`. `useIdempotentMutation`, `useApiErrorHandler`, `applyServerErrors` arrive with their first users (forms in phase d, idempotent actions in phase f) | Current APIs; no unused helpers |
| R-15 | Domain utilities (T-B6): `@nile/domain` keeps its own `as const` enum value lists; `enums.type-test.ts` checks each against the generated API union in both directions, using `@nile/api` as a **devDependency for type-only test files** (no runtime import, so §2.1 still holds). Labels are grouped by view where the specs word them differently (`ORDER_STATUS_LABELS.customer/admin`, `SELLER_ORDER_STATUS_LABELS.customer/seller/admin`, `SHIPMENT_STATUS_LABELS.admin/agent`, …). `formatDateTime` builds `14 Oct 2026, 10:30` from `Intl` parts, because `en-EG` orders them `Oct 14, 2026`. `countdown(deadline, nowMs)` rounds seconds up and labels `mm:ss` / `{h} h {mm} min`. `fields.egPhone` takes the 10 digits after `+20` (a leading `0` dropped) and outputs E.164. The error-code message map (`labels/errors.ts`) arrives with `useApiErrorHandler` in phase d | Drift fails type-check without breaking the boundary rules; no unused helpers |
| R-16 | Test infrastructure (T-B7): `@nile/test-utils` = `.` (typed `mockApi(method, path, ({ reply }) => reply.ok(data))` whose path and data must match the snapshot, `okBody`/`errorBody`, `defineFactory<'Dto'>()` with one example factory; DTO factories arrive with their first tests), `./react` (`renderWithProviders` with the app query client, retries off, plus `user-event`), `./e2e` (node-only backend, Mailpit and account helpers, §12.3). Contract suite in `packages/api/contract`: validators built with Zod `fromJSONSchema` from the **corrected** snapshot with every object closed (`additionalProperties: false`), so a missing, mistyped, wrongly nullable or undocumented field fails with endpoint and field path; it checks every public GET (the list is compared with the snapshot), every parameter-free GET of each role, and 400/401/403/404 envelopes whose codes must be in `error-codes.ts`. `npm run test:contract` (not part of `npm test`; `contract.yml` in CI). `@nile/api` has `@nile/test-utils` as a devDependency (contract suite only), a dev-time cycle with test-utils' runtime dependency on `@nile/api`. Playwright: `e2e/` with one project per app (production builds, `SESSION_COOKIE_SECURE=true` on http://localhost) plus `fixtures`; per-role fixtures create accounts through the backend; one axe-checked smoke page per app until phase d. `playwright-core` is pinned at the root so `@axe-core/playwright` shares Playwright's copy | Contract drift fails loudly with a named field; mocks can't drift from the contract; no unused helpers |
| R-17 | Design tokens (T-C1): `@nile/ui/src/tokens.ts` holds the values; `theme.css` exposes them to Tailwind v4 (`@theme` for scales, type, spacing, radii, shadows; shadcn-style `:root` variables mapped with `@theme inline` for semantic colours) and a unit test keeps both equal. Tailwind's default palette is switched off (`--color-*: initial`), so only tested colours exist. Every app imports `tailwindcss` + `@nile/ui/theme.css` in `globals.css` with `@source` on `packages/ui/src`, and loads Inter through `next/font/google` (self-hosted at build, CSP `font-src 'self'`) as `--font-inter`. `@nile/ui` exports `.`, `./cn`, `./components/*`, `./theme.css`, `./tokens` (React-free, for tests). No inline `style` attributes in components: the CSP has no `'unsafe-inline'` for styles (§10). Playwright never reuses a running server (`reuseExistingServer: false`): a leftover server would serve an older build | Tokens have one source; contrast is tested, not hoped for |
| R-18 | Core components (T-C2): `@nile/ui` stays free of Next.js; components that need routing take values and callbacks (DataTable `sort`/`onSortChange`, filters in a `toolbar` slot), and the app binds them to the URL. `DataTable` emits the API sort format (`-createdAt`); the app narrows it to the endpoint's allowed values (typed in the snapshot). `Field` takes a React Hook Form `control`/`name` and a `render` prop that spreads `controlProps` (`id`, `aria-describedby`, `aria-invalid`, `aria-required`). Status colours come from exhaustive tone maps (`SELLER_ORDER_STATUS_TONES`, …; warning = waiting on someone, success = done, destructive = failed/blocked, neutral = closed/inactive, info = in progress). `toast()` keeps a small browser-side store rendered by `<Toaster />` (mounted once per app in T-C3). Shared component copy in `UI_COPY`. Component a11y tests run axe-core in jsdom without `color-contrast` and `region` (layout and page rules), which Playwright checks on the storefront gallery `/design/components` (TC-1). Playwright runs with 2 workers: four production servers plus browsers starved axe runs with more | Next-free, testable components; accessibility checked where each check works |
| R-19 | Shells (T-C3): shell components live in `apps/<app>/src/components/shell` and use Next.js `Link` with typed routes from `src/lib/routes.ts`; shared markup comes from `@nile/ui` (`SkipLink`, `MAIN_CONTENT_ID`, `navLinkClasses`, `isActivePath`, `PageHeader`, `PlaceholderScreen`, `NotFoundScreen`). Storefront: the root layout wraps every page in the shell (spec 01 "header on every page"); the shell is a Server Component and only the header is a client component. Seller/admin/agent: the shell is the `(portal)` route-group layout, so the phase d auth pages sit outside it; their root `not-found.tsx` renders its own `<main>`. `error.tsx` uses Next.js 16's stable `retry` prop. Root-layout title `template`s don't apply to pages of the same segment, so the storefront home page sets no title and keeps the brand default | One `<main>` per page; auth pages need no shell changes; typed links everywhere |

| R-20 | BFF session and routes (T-D1, decided 2026-10-14): `@nile/auth/server` exports `createAuthRouteHandler` / `createBffRouteHandler`, both taking `() => AuthAppConfig` built lazily from the server env in `apps/<app>/src/lib/server/auth-config.ts`. Auth and BFF answers use the **backend envelope** (`{ success, data }` / `{ success: false, error, correlationId }`), so the browser parses both alike; `WRONG_APP` carries the role as `details[0] = { field: 'role', constraint: 'app', value: <role> }`. Backend unreachable → `502 NETWORK_ERROR`, timeout → `504 UPSTREAM_TIMEOUT`; a non-empty body that isn't `application/json` → `415 VALIDATION_FAILED` (detail `Content-Type`), oversized → `413 PAYLOAD_TOO_LARGE`, invalid JSON → `400 MALFORMED_JSON`; login bodies are shape-checked (`email`, `password`, nothing else) and the BFF adds `deviceName` = `Web (<app>)`. `refresh` without a readable session → `401 UNAUTHENTICATED` (cookies cleared if one was sent). A sign-in over an existing session revokes the old refresh token (best effort). A session cookie of another role is treated as no session. Only auth actions `login`, `refresh`, `logout` exist so far; `verify-email` (T-D4), `invite` (T-D6) and `password-change` (T-D7) arrive with their screens. Allow-lists live in `@nile/api/src/allow-lists.ts` (paths typed by the snapshot, a test keeps them equal to §1 of design 02 and to the corrected snapshot); the proxy's raw pass-through `forwardToBackend` and `fetchWithTimeout` live in `@nile/api` too, so only that package talks HTTP to the backend. Path parameters must be UUIDs, `idOrSlug` a lower-case slug; the match runs on the raw path, so encoded slashes and dot segments never match. Forwarded browser correlation ids must be UUIDs (else a new one). New package `@nile/logger` (R-2) is used by the BFF | One error model for every route; least privilege; no token outside the server |
| R-21 | Refresh coordination (T-D2, decided 2026-10-14): `@nile/auth/client` exports `createSessionClient({ app, loginPath, isProtectedPath, refreshSkewSeconds, clearPrivateData })` → `{ refresh, onUnauthenticated, signOut, start }`, plus `SessionManager` (mounted once per app as `SessionKeeper` in the root layout) and `SessionExpiredBoundary` (`pending` / `failed(retry)` slots, used by protected pages from T-D3). The check after taking the lock compares the session-version cookie with the value seen **before** waiting (another tab refreshed → skip), not with the clock, so a wrong device clock can't cause or skip a refresh; the server-side skew check (§4.1) still guards stray calls. Only a **401** from `/api/auth/refresh` ends the session; network errors, 429 and 5xx keep it (the failed call surfaces its own error, the timer retries). Proactive checks are at least 30 s apart (`MIN_REFRESH_INTERVAL_MS`). When the session ends or the user signs out, every tab clears private queries; tabs on protected pages go to `/login` (`?notice=session-ended&returnTo=…` only when the session ended), tabs on public storefront pages reload in place. Protected pages per app: `apps/<app>/src/lib/access.ts` (storefront `/cart`, `/checkout`, `/account`; portals everything except their sign-in pages), reused by `proxy.ts` in T-D3. Each app's `browserApi` (`src/lib/browser-api.ts`) wires `browserTransport` to the coordinator. E2E (`e2e/storefront/session-refresh.spec.ts`) needs the backend's `ACCESS_TOKEN_TTL_MINUTES=2` (1 is below the 60 s skew: every token would be due at once) and is skipped otherwise | Exactly one rotation per browser; no sign-out on a network blip; shoppers aren't thrown out of public pages |
| R-22 | Route protection (T-D3, decided 2026-10-14): `proxy.ts` (`createRouteGuard`) **decrypts** the session cookie locally (no backend call, no refresh) instead of checking presence only, and deletes an unusable cookie (tampered, unknown key, refresh token expired, other role) on the response; presence alone would loop between a protected page and `/login` with a stale cookie. Signed out on a protected page → `/login?returnTo=<path+query>` (`_rsc` dropped); signed in on `/login` (and `/register` where it exists) → safe `returnTo` or the role home `/`. An expired *access* token still counts as signed in (the browser refreshes). `proxy.ts` passes the page path to Server Components in `x-nile-pathname` (always overwritten), from which `requireSession()` builds `returnTo`. DAL (`createDal` → `readSession`, `requireSession`) returns `{ user, accessTokenExpired }` only, never the token (server API calls get it from their own helper in phase e); it calls `cookies()` before reading server settings, so prerendering never reads them. `safeReturnTo` (shared by server and client entries) accepts only `/`-relative paths: no `//`, ``, schemes, control characters, `/api/*` or excluded pages. Every page on a protected path calls `await requireSession()`; a test per app fails when one doesn't. Portals get placeholder `/login` pages (T-D5 seller, T-D6 admin/agent). User sign-out sends protected tabs to `SIGNED_OUT_PATH` (storefront `/`, portals `/login`, conventions §2; corrects T-D2). E2E fixture `signIn(app)` signs a browser context in through the BFF, fresh per test (shared cookies would replay rotated refresh tokens); portal shell tests use it | No redirect loops; no open redirect; proxy.ts is never the only check |
| R-23 | Customer sign-in screens (T-D4, decided 2026-10-14): screens in `apps/storefront/src/app/(auth)/` (thin pages reading and validating `searchParams`) with forms in `features/auth`. Sign-in and email verification call the auth routes through `@nile/auth/client` (`signIn`, `verifyEmailAndSignIn`; `verify-email` route for storefront and seller only, same role check as login); registration, codes and reset go through the BFF proxy with `browserApi`. After a session change the page is **fully reloaded** at the validated `returnTo` (or `/`), so no cached data of a previous visitor survives. Errors: `errorMessage(error, overrides)` and `applyServerErrors(error, setError, fieldMap)` in `@nile/query` (field text is the field's own rule, never the backend message), default copy in `@nile/domain` `labels/errors.ts`; `RATE_LIMITED` disables the action with a live countdown from `Retry-After` (`useCooldown` in `@nile/ui`). The 60 s resend cooldown starts on arrival only when the previous screen just made the backend send a code (`sent=1`, removed from the address bar once read); arriving from sign-in (`EMAIL_NOT_VERIFIED`, `notice=email-not-verified`) offers a code at once, because the backend sends none then. Header account area (`features/account`): asks `GET /me` only when the session-version cookie exists; 'Hi, {firstName}' menu (Orders, Addresses, Account, Security, Sign out) with placeholder pages for T-G1, T-G2, T-D7 and `/cart` (T-F1). The refresh coordinator does nothing (and navigates nowhere) when there is no session cookie: a visitor's 401 is just a 401. New `@nile/ui` parts: `PasswordInput` (show/hide), `PhoneInput` (+20 prefix), `Notice`, `DropdownMenu`, `useCooldown`; jsdom test setup shared as `@nile/test-utils/jsdom-setup`. The browser transport copies method, headers, body and signal explicitly instead of `new Request(url, request)` (which drops the method in Vitest's jsdom) | One error model in every form; no enumeration; no reload loop for visitors |
| R-24 | Shared sign-in screens and seller sign-in (T-D5, decided 2026-10-14): new workspace package `@nile/auth-screens` (depends on `@nile/ui`, `@nile/query`, `@nile/domain`, `@nile/auth`, `@nile/api`; no new third-party dependency) holds the sign-in, verify-email, forgot- and reset-password forms, their schemas, copy, `useSubmitFailure` and `FailureAlert`; `@nile/auth-screens/params` holds the query-parameter names and server-side readers (`returnToParam(params, authPaths)`, `emailParam`, `noticeParam`, `codeSentParam`). Like `@nile/ui` it is free of Next.js: each app wraps its `(auth)` route group in a client provider (`StorefrontAuthScreens`, `SellerAuthScreens`) giving routes, `authPaths`, the other roles' sites (`{ account, site, url }`, so spec 02's "customer account … store site" wording fits), the BFF calls, `navigate` (router push) and its `Link` (the one place runtime-built hrefs are cast to `Route`). Registration forms stay in the apps. `Field` takes the form's transformed output type as a third generic (an empty landmark becomes `null`). Seller: `(auth)` pages outside the portal shell with their own `<main>`; registration with the pickup address (any of the governorates from `GET /governorates`, empty landmark omitted, `BUSINESS_NAME_TAKEN` / `GOVERNORATE_NOT_FOUND` on their fields, the latter reloads the list); the verify screen adds "After verifying your email, our team will review your application."; the portal shell shows the business name and status badge and the status banner (spec 02 §2.2) on every page from `GET /seller/profile` (stale 1 min, refetch on focus); Re-apply waits for phase h, the rejected banner links to the profile; Sign out is enabled | One implementation of the sign-in screens for four apps; seller status visible from the first page |
| R-25 | Invites and admin/agent sign-in (T-D6, decided 2026-10-15): the auth route action `invite` (storefront only; the plan's separate `api/auth/invite/route.ts` is the existing `[action]` route) accepts `{ token, password }` exactly, calls `POST /auth/invite/accept`, **always** revokes the returned refresh token at once, writes no cookie and answers `{ role, email }`; any role other than admin or delivery agent gets a generic `500 INTERNAL_ERROR` (session already revoked). `@nile/auth/client` `acceptInvite()`. Storefront `/invite` (SF-20, in `AUTH_PATHS`, `referrer: no-referrer`): the token is read in the browser only (never in the server render), removed from the address bar with `history.replaceState`, checked for 43 characters, then the page sends the invitee to `<NEXT_PUBLIC_ADMIN_URL|NEXT_PUBLIC_AGENT_URL>/login?notice=invited&email=…`; `INVALID_INVITE_TOKEN` → "This invitation has expired or was already used. Ask an admin to send a new one." and the form is disabled. `@nile/auth-screens`: notice `invited` ("Your password is set. Please sign in."), `wrongAppMessage` for apps whose spec words it without a link (admin "This isn't an admin account.", agent "This isn't a delivery agent account."). Admin and agent apps: sign-in, forgot and reset pages on the shared screens outside the portal shell; the admin shell shows the signed-in email (read from the session by the portal layout on the server; tokens stay server-side) and Sign out; the agent `/me` placeholder has Sign out until AG-02 (T-H12). Every sign-in, registration and invite form keeps its submit button disabled until hydration (`useHydrated`, `@nile/auth-screens`): a click before hydration submitted the form natively as a GET with the password in the URL (found by the E2E run; regression test renders each form on the server). Local backend must set `INVITE_URL_BASE=http://localhost:4100/invite` for emailed links to land on the storefront | Invitees never get a storefront session; the token never reaches a server log or the page HTML |
| R-26 | Change password (T-D7, decided 2026-10-15): auth route action `password-change` (all apps) accepts `{ currentPassword, newPassword }` exactly; the BFF adds the session's Bearer token and refresh token for `POST /auth/password/change`; the backend keeps this session and revokes the others, so the cookie is unchanged and the answer is `204`. An expired access token → `401 UNAUTHENTICATED` without a backend call; `@nile/auth/client` `changePassword(body, onUnauthenticated)` refreshes through the app's coordinator and retries once. `INVALID_REFRESH_TOKEN` clears the cookies and the screen signs out every tab with the session-ended notice. `SecurityScreen` in `@nile/auth-screens` (SF-19 / SE-17 / AD-23 / AG-08): note that other devices are signed out, form (current, new, confirm), `INVALID_CURRENT_PASSWORD` and `PASSWORD_UNCHANGED` on their fields, toast "Password changed.", Sign out. Each app's `features/security` passes its session client; agent gets `/security`, linked from the Me placeholder | One security screen for four apps; the session survives its own password change |
| R-27 | Category navigation (T-E1, decided 2026-10-15): `src/lib/server/public-api.ts` `publicServerApi({ revalidateSeconds? })` (no session, no token; `fetch(request, { next: { revalidate } })` when caching, else `no-store`) and `src/lib/server/categories.ts` `getCategoryTree()` (React `cache` per request, Next data cache 300 s, placed in the request's query client; calls `connection()` first so nothing is fetched at build time, when the backend and server settings aren't available — every storefront page is therefore rendered per request). The shell (server) loads the tree and hydrates it into the header (`HydrationBoundary`); a failure leaves the menu to load it on the client with a retry. Menu: desktop Radix dropdown with top-level categories and their direct children; phones a drawer with expandable levels down to the third (`aria-expanded`/`aria-controls`). Category page `/c/[slug]` in the `(shop)` group (with `/search`): slug resolved from the tree (`findCategoryPath`, no by-slug endpoint), unknown/inactive → `notFound()` (404), `generateMetadata` title, breadcrumbs (`aria-current`), subcategory chips; listing placeholder for T-E2. Home (split with T-E2): "Shop by category" tiles; "New arrivals" placeholder for T-E2 (spec 01 v1.1, 2026-10-15: no home search box, the header's is on every page). The header's search landmark is named `Site search` | Menu links in the HTML (FQ-7) without a per-visitor request; one tree request per 5 minutes |
| R-28 | Product listing (T-E2, decided 2026-10-15): `features/catalog/lib/listing-params.ts` is the single URL ⇄ API mapping (spec 01 SF-04): `parseListingParams` (syntax; invalid values dropped; min > max swapped; `best-match` only with `q`), `resolveListing` (category in effect; attribute filters kept only for the category's own codes/options, in API order, ≤ 5, none without a category), `toProductQuery` (through `productQuery()`, which throws on any combination the backend refuses) and `listingQueryString` (canonical URL, default sort omitted, cursor never in the URL). Query key `['storefront','products','list', apiQuery]` (design 02 §2.2), stale 30 s. Server pages (`/search`, `/c/[slug]`) resolve the listing (`lib/server/catalog.ts` `loadListing`: category attributes cached 5 min, first page prefetched `no-store`) and hydrate `ProductBrowser` (client): sort select, search-page category refinement (drops attribute filters), filter panel (desktop sidebar, phone sheet: price Apply with validation, in stock, attribute checkboxes, Clear all), removable chips, results with `keepPreviousData` and a React transition (previous results dimmed until the new ones arrive), "Load more" by cursor, empty/error states, INVALID_QUERY/INVALID_CURSOR → back to the defaults with the conventions notice. Search title: `Results for "q"`, seller's name from the first result, else "All products". Home "New arrivals": 12 newest server-rendered with "See all". Product card: stretched product link, separate seller link; `/p/[idOrSlug]` placeholder for T-E3 | Every URL state maps to one API request; Back/Forward restore filters |
| R-29 | Product detail (T-E3, decided 2026-10-15): `/p/[idOrSlug]` (spec 01 name; the plan said `[slug]`), server-rendered `no-store` through `lib/server/catalog.ts` `getProduct` (React `cache` for page + metadata; `PRODUCT_NOT_FOUND` → the segment's `not-found.tsx` "This product isn't available any more.", HTTP 404); reached by a UUID that isn't the slug → `permanentRedirect` (308) to `/p/<slug>` keeping the query. Metadata: title, description (first 160 characters), canonical (absolute via the storefront's `metadataBase` from `NEXT_PUBLIC_STOREFRONT_URL`). Breadcrumbs from `category.path` then the product name (shared `Breadcrumbs`). `lib/variant-selection.ts` (pure): `initialSelection` (`?variant=` when it belongs to the product, else single-option attributes), `selectedVariant` (exactly one match; a product without attributes has its default variant), `optionState` (`unavailable` → disabled radio with "Not available in this combination" for screen readers; `outOfStock` → selectable, marked), `maxQuantity` (min(available, 99)), `parseQuantity` (`?qty=`). `ProductView` (client): price range until a variant is chosen, then its price with the compare-at struck (read as "Was …"), option groups as radio chips (visually hidden inputs, labelled chips), availability (In stock / Out of stock, no counts), quantity stepper, SKU details; the selection is mirrored to `?variant=` with `history.replaceState` (no server round-trip). Add to cart: signed out → `/login?returnTo=/p/<slug>?variant=<id>&qty=<n>` (FQ-6); signed in → disabled with the T-F1 note until the cart write exists (decided 2026-10-15). Description rendered as plain text (`whitespace-pre-line`). Rule found by the E2E run: never import a constant from a `'use client'` module into a Server Component (it is a client reference, `undefined` on the server); shared constants live in plain modules (`lib/product-params.ts`). JSON-LD not added: it needs `dangerouslySetInnerHTML` with API data, which CLAUDE.md §7 forbids (open item SF-JSONLD) | The price and add button always belong to the selected variant; the shopper returns from sign-in to the same choice |
| R-30 | Cart (T-F1, decided 2026-10-15): `features/cart` — query `['storefront','cart','detail']` (stale 0, refetch on focus, only with a session); add and quantity change replace the cache with the returned `CartDto`, remove and empty refetch (204); every failure refetches, so the page always shows the last cart the API returned; totals, subtotals and `itemCount` are shown as the API sends them, never recomputed. An add is never retried: an ambiguous failure (no response, timeout, 5xx) refetches the cart and says "We couldn't confirm this was added. Check your cart." (adds are summed, no idempotency key [SPEC 08 CT-5]). Add errors per spec 01 SF-05-A1 (`VARIANT_NOT_PURCHASABLE` / `INSUFFICIENT_STOCK` re-render the product from the server; the available count is parsed from `details[0].message` `available: <n>`). Cart page: seller groups, lines (attributes, SKU, unit price, line total, issue notices, "Set to {n}" for `INSUFFICIENT_STOCK`; stepper frozen for `UNAVAILABLE`/`OUT_OF_STOCK`), quantity saved once 500 ms after the last change, remove without confirmation, empty with a confirm dialog, checkout link only without issues (else disabled with the reason); `/checkout` placeholder for T-F3. Header cart link with the `itemCount` badge (hidden at 0) for signed-in customers. Shared `QuantityStepper` in `@nile/ui`; `useHasSession` moved to `src/lib/use-has-session.ts` (account and cart both need it, without importing each other) | The cart shown is always the API's; no double add |
| R-31 | Checkout address (T-F2, decided 2026-10-15): `features/addresses` (query `['storefront','me','addresses']`, stale 60 s; create form shared with the address book, T-G2) and `features/checkout`. Checkout fetches cart, addresses and governorates on the client; governorates with stale 0 and refetch on mount (fees feed the total, a cached fee is never used). Entry guard: empty cart → `/cart`; `hasIssues` → `/cart?notice=needs-attention` ("Some items in your cart need attention."; notice values in `features/cart/notices.ts`, validated by the page). Addresses as returned (default first); an address in a non-deliverable governorate (`isDeliverable=false` or `deliveryFee=null`) is shown disabled with "We don't deliver to {governorate} yet."; the default is preselected only when deliverable; a choice that stops being deliverable is dropped. "Add a new address" opens the form in a dialog (inline when there is none); a saved address is selected when deliverable. Spec 04 C-3: without a default the form says "This will be your default address." and sends `isDefault: true` (no checkbox); empty optional fields are omitted. `GOVERNORATE_NOT_FOUND` reloads governorates and asks to choose again; `ADDRESS_LIMIT_REACHED` is a form alert; at 20 addresses the add button is replaced by the limit message. Summary: items total and delivery fee ("—" until an address is chosen); payment, review and "Place order" come with T-F3. `addressFactory` added to `@nile/test-utils` | A non-deliverable address can never be chosen; the fee shown is always fresh |
| R-32 | Place order, COD (T-F3, decided 2026-10-15): `useIdempotentMutation` built in `@nile/query` as §6.1 (key per intent = stable JSON of the body, reused on retry, new on a changed body, cleared on success or `resetIntent()`; `IDEMPOTENCY_REQUEST_IN_PROGRESS` re-sent after 1 s, at most 3 times; never retried by TanStack). Checkout adds payment method (no preselection; "Pay by card (Kashier)" shown disabled with the T-F4 note until T-F4), the review grouped by seller (parcels note for several sellers), the total `expectedTotal = addMoney(itemsTotal, deliveryFee)` shown and sent as is, and "Place order" (enabled with an address and a method; "Placing your order…" while pending). Errors per SF-07-A1: `CART_EMPTY` → `/cart`; `CART_HAS_ISSUES` / `INSUFFICIENT_STOCK` → `/cart` with notices `unavailable` / `stock`; `ORDER_TOTAL_CHANGED` → `resetIntent()`, refetch cart and governorates, confirm dialog with the recomputed total (Go back sends nothing); `ADDRESS_NOT_FOUND` → refetch addresses, selection cleared; `GOVERNORATE_NOT_DELIVERABLE` → refetch governorates (the address turns disabled); `RATE_LIMITED` countdown; others a form alert, retried with the same key. `ORDER_PAYMENT_PENDING` comes with T-F4 (only reachable with Kashier). Success: set `orders.detail`, invalidate `cart` and `orders.list`, the entry guard is switched off so the emptied cart doesn't bounce to `/cart`, push `/checkout/confirmation/{id}`. The key lives in memory: a page reload during submit loses it, and a second attempt is then refused by the backend because the first emptied the cart (`CART_EMPTY`) [SPEC 09; the emptied cart is checked by the COD E2E]. SF-08 confirmation from `GET /orders/{id}` only (`features/orders`: `orderKeys`, `orderQuery`, stale 0); `ORDER_NOT_FOUND` → not-found screen; not placed/in progress → "Order {n}: {status}". `/account/orders/[orderId]` placeholder (T-G3) so "View order" stays type-checked. `addressLines` accepts a shipping-address snapshot; `orderDetailFactory` added to `@nile/test-utils` | Double clicks and retries never create two orders; a changed total is never charged unconfirmed |
| R-33 | Card payment (T-F4, decided 2026-10-15): "Pay by card (Kashier)" enabled. After a card checkout the order id goes to `sessionStorage` (`nile.pendingPaymentOrderId`, every access guarded) and the browser leaves for `kashier.checkoutUrl` only if it is `https:`; `checkoutUrl = null` → `POST /orders/{id}/payment/kashier-session` first; no session or a non-https URL → `/account/orders/{id}` (placeholder until T-G3, where Pay now will be). `ORDER_PAYMENT_PENDING` → dialog linking to the order in `details[0].value`. SF-09 `/checkout/payment-return` (`features/checkout/kashier`): never reads the query; order id from storage, else the newest `pending_payment`/`placed` order created within 1 h (`orders.latestOpen`, `inValues`, `sort=-createdAt`), else "We couldn't find your order."; polls `GET /orders/{id}` every 3 s while visible (`refetchIntervalInBackground: false`) until final or `paymentExpiresAt` + 2 min; placed or later → clear the id, "Payment received…" + summary; cancelled → clear the id, message + Buy again + Continue shopping; pending → "Confirming your payment…", countdown and Pay now until `paymentExpiresAt`; past the grace time → stop, link to the order. `PayNow` (SF-18-A2: `ORDER_NOT_AWAITING_PAYMENT` refetches, `PAYMENT_PROVIDER_UNAVAILABLE`, `RATE_LIMITED`) and `BuyAgain` (SF-18-A3: open quantities, one add at a time, never retried, skip after `CART_LINE_LIMIT_REACHED`, stop on an ambiguous failure, one cart refresh, per-item result dialog) are shared for T-G3. E2E verified the `SameSite=Lax` assumption: the session survives Kashier's cross-site return [VERIFIED] | The outcome shown is always the API's; the Kashier URL is followed only over https |
| R-34 | Profile (T-G1, decided 2026-10-15): `/account` renders SF-15 from `me.profile` (the header's query). Email shown as text with "Email can't be changed." (no input); first name, last name (trimmed, 1..100) and mobile phone (`fields.egPhone`, shown without `+20`); "Member since {date}" with the new `formatDate` (`14 Oct 2026`, Cairo) in `@nile/domain`. `profilePatch` compares the normalised values with the profile and sends only what differs; Save is disabled while nothing differs (a value that doesn't parse counts as a change so its error shows). Success: set `me.profile` (the header greeting follows), reset the form to the answer, toast "Profile saved."; `VALIDATION_FAILED` mapped to fields, others a form alert | PATCH never sends an unchanged or empty body |
| R-35 | Address book (T-G2, decided 2026-10-15): `/account/addresses` renders SF-16: cards as returned (default first), "Default" badge, address lines, "Not deliverable yet", Edit / Delete / "Make default" (non-default only; buttons named with the label). "Add address" in the header (hidden at 20 with "You can save up to 20 addresses."), empty state with the same button, "Choose a default address." when none is default (no automatic promotion [SPEC 04]). `AddressForm` gained an edit mode (`mode: create | edit`, `onSaved`): prefilled, `toUpdateAddressBody` sends only changed fields after normalisation, a cleared optional field as `null`, `isDefault` only as `true`; Save disabled without a change; the default address shows "This is your default address…" instead of the checkbox (no unset). Make default = `PATCH { isDefault: true }`; delete behind a confirm; every mutation invalidates `me.addresses`. `ADDRESS_NOT_FOUND` (edit, make default, delete) → toast "This address no longer exists." + reload; `GOVERNORATE_NOT_FOUND` as in create; other failures toast the default message | PATCH never sends unchanged fields or an unset default |
| R-36 | Orders (T-G3, decided 2026-10-15): SF-17 `/account/orders` with tabs as links in the URL (`?status=awaiting-payment|in-progress|completed|cancelled`, none = All; unknown → All) mapped to `status[in]` via `inValues`; `orders.list({ status })` infinite query, `limit=20`, `sort=-createdAt`, "Load more"; rows link to SF-18; empty "You haven't placed any orders yet." (All, with "Start shopping") / "No orders here.". SF-18 `/account/orders/[orderId]` replaces the T-F3 placeholder: header (number, placed date, status badge), payment method · payment status, countdown + Pay now only while `pending_payment` and before `paymentExpiresAt`, refetch every 30 s while visible only while `pending_payment` (refetch on focus otherwise), address, one block per seller order (status badge, items linked to `/p/{productId}`, SKU, price × quantity, "{n} cancelled by the seller · {m} still ordered", subtotal, history oldest first), totals as the API sends them with the three SF-18 notes, Buy again on cancelled orders; `ORDER_NOT_FOUND` → not-found screen, and so is `VALIDATION_FAILED` on `GET /orders/{id}`: the backend checks the id's format first (UUID v7), so a mistyped or cut-off link is "not found", not a retryable error (`isOrderMissing`, also used by SF-08 and SF-09; found by the T-G3 E2E) [VERIFIED]. Cancel (A1) comes with T-G4. To keep features acyclic, the Kashier pieces (`PayNow`, session call, https redirect, `sessionStorage` helpers) moved from `features/checkout/kashier` to `features/orders/payment`; checkout imports them through the orders index | Labels and amounts are always the API's; Pay now never after the deadline |
| R-37 | Customer cancellation (T-G4, decided 2026-10-15): "Cancel" in a seller-order block exactly when `canCancel` (named "Cancel the items from {business}"); confirm dialog "Cancel the items from {business}? This can't be undone." (+ "Your refund will be processed by our team." for Kashier orders) with "Reason (optional)" (trimmed, 1..500; empty → `{}`, never `null`); `useIdempotentMutation`, one key per order + seller order + note, reused on retry; success sets `orders.detail` from the answer and invalidates `orders.list`. `SELLER_ORDER_NOT_CANCELLABLE` / `SELLER_ORDER_NOT_FOUND` → close, toast "The seller has already confirmed this part of your order, so it can't be cancelled here.", refetch; other failures keep the dialog with a form alert (Enter in the note never submits). E2E set-up helpers (`signInThroughForm`, `placeCodOrder`) moved to `e2e/fixtures/orders.ts` | A cancel is never sent twice for one intent, and only when the API allows it |

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
