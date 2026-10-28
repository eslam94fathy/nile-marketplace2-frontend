# Web Push manual checklist

Browsers need a real push service, so Web Push isn't covered by E2E (design 01 §15.10, DQ-13). The in-app path (bell, list, live count) is E2E-tested in `e2e/storefront/notifications.spec.ts`. Run this list before a release that touches `@nile/notifications`, the service workers (`apps/*/public/sw.js`) or the manifests, and record the result per browser.

## Setup

- Backend with the worker running and `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` set (backend spec 13 §8.6); `PUSH_ENDPOINT_HOST_ALLOWLIST` as in NO-22.
- The app served over HTTPS, or `http://localhost` (a secure context; any other plain-HTTP origin has no Push API).
- A customer, a seller and an agent account; for the agent, an admin who can assign a shipment.
- Clear the site's data before each browser run (removes the service worker, the subscription and `nile.<app>.pushEndpoint`).

## Per browser and app

| # | Step | Expected |
|---|---|---|
| 1 | Open any page signed in | No permission prompt (spec 00 §12.6: never on page load) |
| 2 | Bell → push card → "Turn on" (agent: the card on Shipments) | The browser asks; after "Allow" the card disappears |
| 3 | Notification settings | "Notifications are on for this device." and "Turn off on this device" |
| 4 | Trigger a notification for this user (seller accepts the customer's order; admin assigns the agent a shipment; customer replies to a ticket the admin is assigned to) with the app's tabs closed | A system notification with the API's title and body and the Nile icon |
| 5 | Click it | A new tab opens on the mapped page (spec 00 §12.5) |
| 6 | Repeat 4 with a tab of the app open on another page; click | That tab is focused and navigates to the mapped page |
| 7 | Trigger a notification whose link belongs to another app (or none) | The click opens the notifications page |
| 8 | Sign out | No push arrives for this user afterwards; the device's subscription is gone (DevTools → Application → Service workers → Push) |
| 9 | Sign in again, turn on, then end the session from another tab (Security → sign out) | This tab leaves the signed-in state and the device is unsubscribed |
| 10 | Block notifications for the site in the browser, reload the settings | "Notifications are blocked for this site in your browser settings." |
| 11 | Settings: turn a category off, Save; trigger a notification of that category | It appears in the bell, but no system notification arrives |
| 12 | DevTools → Network: reload the page | `/sw.js` answered with `Cache-Control: no-cache`; `/manifest.webmanifest` lists the three icons |

## Browsers

| Browser | Notes | Result |
|---|---|---|
| Chrome (desktop, Android) | Push through FCM | |
| Edge (desktop) | Push through Windows (`*.notify.windows.com`) | |
| Firefox (desktop, Android) | Push through Mozilla | |
| Safari (macOS 13+) | Push through Apple | |
| Safari (iPhone / iPad, iOS 16.4+) | Outside the installed app the settings say "On iPhone and iPad, add Nile to your Home Screen first." and the agent's Me page "Add to Home Screen to get notifications."; add to the Home Screen, open from there, then run 2–11 | |
