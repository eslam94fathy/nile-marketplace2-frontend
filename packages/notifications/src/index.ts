// Public interface of @nile/notifications (design 01 §15.1, R-56): the notification centre every app shares.
// Each app wraps its tree in <NotificationsProvider> with its client, routes, link map and Link.
export {
  ALL_NOTIFICATIONS,
  BELL_PAGE_SIZE,
  notificationKeys,
  notificationsInvalidation,
  NOTIFICATIONS_PAGE_SIZE,
  UNREAD_POLL_MS,
  unreadCountQuery,
  type NotificationFilter,
  type NotificationPreference,
  type UserNotification,
} from './api';
export {
  NotificationsProvider,
  useNotificationsConfig,
  type NotificationLinkProps,
  type NotificationsConfig,
} from './config';
export { NOTIFICATIONS_COPY, PUSH_COPY, SETTINGS_COPY } from './copy';
export { NOTIFICATION_FILTER_PARAMS, notificationsHref, parseNotificationFilter } from './filter';
export {
  browserPushEnvironment,
  pushStorageKeys,
  readPushState,
  SERVICE_WORKER_URL,
  UNREGISTER_TIMEOUT_MS,
  unregisterPush,
  unsubscribePushLocally,
  type PushEnvironment,
  type PushState,
  type PushSubscriptionLike,
} from './push';
export { usePushEnvironment, usePushSubscription, type PushSubscriptionControls } from './use-push';
export { NotificationBell } from './components/notification-bell';
export { NotificationSettings } from './components/notification-settings';
export { NotificationsPage, type NotificationsPageProps } from './components/notifications-page';
export { PushPromptCard, type PushPromptCardProps } from './components/push-prompt-card';
