// Copy of the notification centre (spec 00 §12.4–§12.6). Sentences marked "T-J6" are not in the spec; they were
// approved on 2026-10-28 (CLAUDE.md §14.1aw).

export const NOTIFICATIONS_COPY = {
  title: 'Notifications',
  /** Accessible name of the bell (spec 00 §12.4). */
  bellLabel: (unread: number) => `Notifications, ${String(unread)} unread`,
  /** The badge text: the API caps the count at 100, the badge shows `99+` above 99. */
  badge: (unread: number) => (unread > 99 ? '99+' : String(unread)),
  markAllRead: 'Mark all as read',
  seeAll: 'See all',
  settings: 'Notification settings',
  /** Screen-reader text next to the unread dot (no colour-only meaning). */
  unread: 'Unread',
  /** T-J6 */
  empty: 'No notifications yet.',
  /** T-J6 */
  emptyUnread: 'No unread notifications.',
  /** T-J6 */
  markAllFailed: 'Notifications couldn’t be marked as read. Try again.',
  filters: {
    label: 'Show',
    all: 'All',
    unread: 'Unread',
    categoryLabel: 'Category',
    /** T-J6 */
    allCategories: 'All categories',
  },
} as const;

export const SETTINGS_COPY = {
  title: 'Notification settings',
  pushHeading: 'Push notifications',
  pushDescription: 'Push notifications on this device and your other signed-in devices',
  /** Spec 00 §12.6 (in-app notifications can't be turned off, backend spec 13 R-6). */
  inAppNote: 'In-app notifications can’t be turned off.',
  save: 'Save',
  /** T-J6 */
  saved: 'Notification settings saved.',
} as const;

export const PUSH_COPY = {
  deviceHeading: 'This device',
  turnOn: 'Turn on notifications on this device',
  turnOff: 'Turn off on this device',
  /** T-J6 */
  on: 'Notifications are on for this device.',
  unsupported: 'This browser can’t show notifications.',
  denied: 'Notifications are blocked for this site in your browser settings.',
  needsInstall: 'On iPhone and iPad, add Nile to your Home Screen first.',
  /** T-J6: the push service refused the subscription or the browser failed to create one. */
  failed: 'Notifications couldn’t be turned on. Try again.',
  /** T-J6: `PUSH_ENDPOINT_NOT_ALLOWED`: the browser's push service isn't one the backend sends to. */
  endpointNotAllowed: 'This browser’s notification service isn’t supported.',
  cardTurnOn: 'Turn on',
  cardDismiss: 'Dismiss',
} as const;
