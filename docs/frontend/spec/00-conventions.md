# Spec 00 — Frontend conventions (shared by all app specs)

Status: **v1.0 APPROVED (2026-10-14)**, with its [PROPOSED] items (approved together with spec 01). Changes from now on need explicit approval and a version bump.
Inputs: `CLAUDE.md`, `docs/frontend/{api-inventory,architecture,workflows}.md`, backend spec `../nile-marketplace2/docs/spec/` (APPROVED versions as of backend `4ad89a6`).

App specs: `01-storefront.md` · `02-seller.md` (later) · `03-admin.md` (later) · `04-agent.md` (later).

---

## 1. How the app specs are written

Each app spec has:
1. **Scope** (and what is out of scope, with the reason)
2. **Global elements** (layout, header, navigation, session behaviour)
3. **Screens**, one section each, in the notation below
4. **Copy**: labels for enums and messages for error codes used by the app
5. **Acceptance criteria** per screen
6. **Open questions** (`<APP>-Q-n`) with options and a recommendation

Labels: **[SPEC n]** = rule from backend spec `n` · **[VERIFIED]** = seen in the running API/OpenAPI · **[PROPOSED]** = frontend UX choice awaiting approval · **[OPEN]** = question.
A [PROPOSED] item is a UX decision, never a business rule. Business rules always cite the backend.

### 1.1 Screen notation

```
### <APP>-<nn> Screen name
Route: /path/[param]     Access: public | customer | seller | admin | delivery_agent     Render: server | client | server shell + client
Data:   METHOD /endpoint (when; cache policy)
Content: what is shown, field by field, in order
Actions: name — condition → call → on success → errors (code → behaviour)
States: loading · empty · error · not authorised
Acceptance: numbered, testable criteria
```

Screen ids: storefront `SF-nn`, seller `SE-nn`, admin `AD-nn`, agent `AG-nn`.

## 2. Access and session behaviour (all apps)

| Situation | Behaviour |
|---|---|
| Protected route, no session | Redirect to the app's `/login?returnTo=<current path + query>` |
| Session present, wrong role | Cannot happen inside one app (login rejects other roles, `architecture.md` §4); if it does, end the session and show the login page |
| Access token expired during a request | Silent refresh (serialised) and one retry; the user notices nothing |
| Refresh fails (`INVALID_REFRESH_TOKEN`) | Session ended: clear cache, toast "Your session has ended. Please sign in again.", redirect to login with `returnTo` |
| `ACCOUNT_SUSPENDED` at login, or `UNAUTHENTICATED` after a suspension | Login page shows "This account is suspended." No retry |
| Logout | `POST /api/auth/logout`, cache cleared, all tabs of the app go to the public home (or login for portal apps) |
| `returnTo` | Only same-origin relative paths; anything else is ignored and the role home is used |

## 3. Standard states

| State | Rule |
|---|---|
| Loading | Skeletons in the shape of the content for first loads; inline spinners for actions; never a blank page. Server-rendered pages stream with `loading.tsx` |
| Empty | A sentence that says what is empty and the next useful action (e.g. "Your cart is empty. Browse categories") |
| Error (query) | Inline error block with "Try again" (refetch) and the reference (`correlationId`) in small text |
| Error (mutation) | Toast or form-level alert with the mapped message and the reference; the form keeps its input |
| Not found | The app's not-found page (`404` from the API on an id/slug in the route) |
| Not authorised | Covered by §2; business-status blocks (seller not approved, agent inactive) are app-specific |

## 4. Default error-code handling

Applies unless a screen overrides it.

| Code | Default behaviour | Message (copy) |
|---|---|---|
| `VALIDATION_FAILED` | Map `details[].field` to fields; others → form alert | Field: the backend message is not shown; the field's own rule text is. Form: "Some fields need attention." |
| `UNAUTHENTICATED` | §2 refresh flow | – |
| `FORBIDDEN` | Error block | "You don't have access to this." |
| `*_NOT_FOUND` on the route resource | Not-found page | – |
| `*_NOT_FOUND` on a sub-resource after an action | Refetch the parent, toast | "This item no longer exists." |
| `*_INVALID_STATUS_TRANSITION`, `*_NOT_CANCELLABLE` | Refetch the resource, toast | "This was already updated. We've refreshed the page." |
| `CONFLICT` | Refetch, toast | "This was changed by someone else. Please try again." |
| `IDEMPOTENCY_REQUEST_IN_PROGRESS` | Wait 1 s, retry with the same key (max 3), then error toast | "Still working on your previous request…" |
| `RATE_LIMITED` | Disable the action for `Retry-After` seconds with a countdown | "Too many attempts. Try again in {n} s." |
| `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`, `NETWORK_ERROR` | Error block / toast with retry | "Something went wrong. Please try again." + reference |
| `INVALID_QUERY`, `INVALID_CURSOR` | Reset list parameters to defaults, notice | "Some filters were not valid and have been reset." |
| Anything unmapped | As `INTERNAL_ERROR`, logged with the code | – |

## 5. Forms

- Field rules mirror backend DTO rules exactly (lengths, patterns, required/optional/nullable); the table in each screen spec lists them.
- Validation runs on blur and on submit; messages appear under the field and are announced (`aria-describedby`, `aria-invalid`).
- Submit buttons show progress and are disabled while submitting; double submission is impossible.
- Optional nullable text fields: an empty input is sent as `null` on edit (to clear) and omitted on create, unless the screen says otherwise.
- Passwords: show/hide toggle; never trimmed; 8 characters minimum, 72 UTF-8 bytes maximum (message: "Password is too long").
- Phone fields [PROPOSED]: a fixed `+20` prefix and a 10-digit input that must start with `10`, `11`, `12` or `15`; a leading `0` typed by the user is dropped (`01012345678` → `+201012345678`). The value sent is E.164.
- Email fields are trimmed and lower-cased before sending (the backend does the same).
- Leaving a form with unsaved changes asks for confirmation [PROPOSED].

## 6. Idempotent actions (UX)

- The key is created when the user confirms the action and kept, with the request body, until the action succeeds or the user changes the input.
- Retrying after a network error or `5xx` reuses the key; a replayed success is shown exactly like a first success.
- A changed body (e.g. a new `expectedTotal`) gets a new key.

## 7. Lists

- "Load more" button below the list (no infinite scroll) [PROPOSED], page size = backend default (20).
- No counts, no page numbers (the API has none).
- Filters and sort live in the URL; Back/Forward restore them.
- Status filters are tabs or chips mapped to `status[in]`.

## 8. Formatting

- Money: `EGP 1,250.00` style via `Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' })` [PROPOSED rendering; exact symbol follows the Intl output].
- Price ranges: `EGP 51.00 – EGP 71.00`; a single value when min = max.
- Dates: `14 Oct 2026, 10:30` in `Africa/Cairo`; relative times ("2 h ago") only where a spec says so.
- Countdowns: `mm:ss` under 1 h, otherwise `h h mm min`; computed from server timestamps; when they reach zero the screen refetches.

## 9. Confirmation dialogs

Required for destructive or irreversible actions: delete, cancel, empty cart, place order (the review step itself counts as confirmation), log out is **not** confirmed. Dialog text states the consequence in one sentence.

## 10. Accessibility and responsiveness

- Breakpoints: 360 px (minimum supported), 768 px, 1280 px.
- Every interactive element is reachable and operable by keyboard; focus moves to dialogs and back; toasts are announced politely; route changes move focus to the main heading.
- Colour is never the only carrier of meaning (status badges have text).

## 11. Copy and tone

- Plain, short, second person ("Your order", "You can cancel…"). No exclamation marks in errors. Sentence case.
- Enum labels and error messages live in central maps; specs list them per app.
- The product name shown in UI copy is "Nile" [PROPOSED].
