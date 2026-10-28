import { NotificationsProvider, type PushEnvironment } from '@nile/notifications';
import { renderWithProviders } from '@nile/test-utils/react';
import type { ReactElement } from 'react';
import { APP } from '@/lib/app';
import { browserApi } from '@/lib/browser-api';
import { NOTIFICATION_LINKS } from '@/lib/notification-links';
import { ROUTES } from '@/lib/routes';

// Screens that use the notification centre (the Shipments push card, Me's install hint) inside its provider,
// with a simulated Web Push browser (no service worker in jsdom).

export interface TestPush {
  readonly supported?: boolean;
  readonly needsInstall?: boolean;
}

/** A browser where push is possible and off, unless told otherwise; nothing is ever subscribed. */
export function testPushEnvironment({
  supported = true,
  needsInstall = false,
}: TestPush = {}): PushEnvironment {
  const storage = new Map<string, string>();
  return {
    supported: () => supported,
    needsInstall: () => needsInstall,
    permission: () => 'default',
    requestPermission: () => Promise.resolve('default'),
    getSubscription: () => Promise.resolve(null),
    subscribe: () => Promise.reject(new Error('not in tests')),
    storage: {
      get: (key) => storage.get(key) ?? null,
      set: (key, value) => storage.set(key, value),
      remove: (key) => storage.delete(key),
    },
    userAgent: () => 'test',
  };
}

export function renderWithNotifications(ui: ReactElement, push: TestPush = { supported: false }) {
  return renderWithProviders(
    <NotificationsProvider
      config={{
        api: browserApi,
        scope: APP.name,
        app: APP.name,
        linkMap: NOTIFICATION_LINKS,
        routes: { list: ROUTES.notifications, settings: ROUTES.notificationSettings },
        navigate: () => undefined,
        Link: ({ href, children, className }) => (
          <a href={href} className={className}>
            {children}
          </a>
        ),
        pushCardText: null,
        pushEnvironment: testPushEnvironment(push),
      }}
    >
      {ui}
    </NotificationsProvider>,
  );
}
