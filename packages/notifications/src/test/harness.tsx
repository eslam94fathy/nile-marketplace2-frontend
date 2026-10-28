import { createApiClient, serverTransport } from '@nile/api';
import { defineNotificationLinks } from '@nile/domain';
import { TEST_API_ORIGIN } from '@nile/test-utils';
import { renderWithProviders } from '@nile/test-utils/react';
import { setupServer } from 'msw/node';
import type { ReactElement } from 'react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { NotificationsProvider, type NotificationsConfig } from '../config';
import type { PushEnvironment, PushSubscriptionLike } from '../push';

// Test harness: the screens inside a provider with the typed client against MSW, a link map, a plain-anchor
// Link and a simulated Web Push browser.

export const api = createApiClient(serverTransport({ baseUrl: TEST_API_ORIGIN }));

export const ROUTES = { list: '/notifications', settings: '/notifications/settings' } as const;

export const LINK_MAP = defineNotificationLinks({
  '/orders/{orderId}': ({ orderId }) => `/account/orders/${orderId}`,
});

export const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1';
/** A VAPID public key shape (65 bytes, base64url). */
export const VAPID_KEY = `B${'A'.repeat(86)}`;

export interface FakePush {
  readonly env: PushEnvironment;
  readonly storage: Map<string, string>;
  readonly unsubscribe: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  readonly subscribe: ReturnType<typeof vi.fn<PushEnvironment['subscribe']>>;
  readonly requestPermission: ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>;
  subscribed: boolean;
  permission: NotificationPermission;
}

/** A browser that supports push, permission `default`, not subscribed, unless told otherwise. */
export function fakePush(
  options: { supported?: boolean; needsInstall?: boolean; answer?: NotificationPermission } = {},
): FakePush {
  const storage = new Map<string, string>();
  const unsubscribe = vi.fn(() => {
    fake.subscribed = false;
    return Promise.resolve(true);
  });
  const subscription: PushSubscriptionLike = {
    endpoint: ENDPOINT,
    toJSON: () => ({
      endpoint: ENDPOINT,
      expirationTime: null,
      keys: { p256dh: 'BPublicKey_-', auth: 'authSecret' },
    }),
    unsubscribe,
  };
  const subscribe = vi.fn<PushEnvironment['subscribe']>(() => {
    fake.subscribed = true;
    return Promise.resolve(subscription);
  });
  const requestPermission = vi.fn(() => {
    fake.permission = options.answer ?? 'granted';
    return Promise.resolve(fake.permission);
  });
  const fake: FakePush = {
    storage,
    unsubscribe,
    subscribe,
    requestPermission,
    subscribed: false,
    permission: 'default',
    env: {
      supported: () => options.supported ?? true,
      needsInstall: () => options.needsInstall ?? false,
      permission: () => fake.permission,
      requestPermission,
      getSubscription: () => Promise.resolve(fake.subscribed ? subscription : null),
      subscribe,
      storage: {
        get: (key) => storage.get(key) ?? null,
        set: (key, value) => storage.set(key, value),
        remove: (key) => storage.delete(key),
      },
      userAgent: () => 'Mozilla/5.0 (Test)',
    },
  };
  return fake;
}

export function makeConfig(overrides: Partial<NotificationsConfig> = {}): NotificationsConfig {
  return {
    api,
    scope: 'storefront',
    app: 'storefront',
    linkMap: LINK_MAP,
    routes: ROUTES,
    navigate: vi.fn(),
    Link: ({ href, className, onClick, children, ...rest }) => (
      <a
        href={href}
        className={className}
        aria-current={rest['aria-current']}
        onClick={(event) => {
          event.preventDefault();
          onClick?.();
        }}
      >
        {children}
      </a>
    ),
    pushCardText: 'Get notified about your orders on this device',
    pushEnvironment: fakePush().env,
    ...overrides,
  };
}

export function renderNotifications(ui: ReactElement, config: NotificationsConfig = makeConfig()) {
  return renderWithProviders(<NotificationsProvider config={config}>{ui}</NotificationsProvider>);
}

/** One MSW server per test file; any request without a handler fails the test (MSW 3). */
export function setupMswServer() {
  const server = setupServer();
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });
  return server;
}
