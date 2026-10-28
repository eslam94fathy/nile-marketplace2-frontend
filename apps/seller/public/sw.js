// Nile Web Push service worker (design 01 §15.5, R-55). A static file, no bundler, reviewed by hand. The source
// is packages/notifications/src/service-worker.js; each app serves an identical copy as /sw.js (a test checks it).
// No fetch handler: there is no offline mode. The link of a notification is mapped by the app's own
// /notifications/open route, so the link map exists only once, in TypeScript.
'use strict';

const OPEN_PATH = '/notifications/open';
const ICON = '/icons/icon-192.png';

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Controls open tabs at once, so a notification click can navigate them.
  event.waitUntil(self.clients.claim());
});

/** The backend's payload `{ notificationId, title, body, link, category }` (spec 13 §8.3), or null. */
function readPayload(event) {
  try {
    const payload = event.data ? event.data.json() : null;
    return payload !== null && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  const payload = readPayload(event);
  if (payload === null || typeof payload.title !== 'string') return;
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: ICON,
    data: { link: typeof payload.link === 'string' ? payload.link : null },
  };
  // One notification per id: a repeated delivery replaces it instead of adding another.
  if (typeof payload.notificationId === 'string') options.tag = payload.notificationId;
  event.waitUntil(self.registration.showNotification(payload.title, options));
});

/** The app's open route for an API link; the route maps it and redirects to a page of this app. */
function openUrl(link) {
  const url = new URL(OPEN_PATH, self.location.origin);
  if (typeof link === 'string') url.searchParams.set('link', link);
  return url.href;
}

/** Focuses an open tab of the app and navigates it, or opens a new tab (spec 00 §12.6). */
async function focusOrOpen(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) {
    if (new URL(client.url).origin !== self.location.origin) continue;
    try {
      const focused = await client.focus();
      await focused.navigate(url);
      return;
    } catch {
      // A tab this worker doesn't control can't be navigated: try the next one, then open a new tab.
    }
  }
  await self.clients.openWindow(url);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data;
  event.waitUntil(focusOrOpen(openUrl(data !== null && typeof data === 'object' ? data.link : null)));
});
