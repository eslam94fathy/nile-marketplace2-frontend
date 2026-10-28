'use client';

import {
  browserPushEnvironment,
  NotificationsProvider,
  unregisterPush,
  unsubscribePushLocally,
  type NotificationLinkProps,
  type NotificationsConfig,
} from '@nile/notifications';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, type ReactNode } from 'react';
import { APP } from '@/lib/app';
import { browserApi } from '@/lib/browser-api';
import { NOTIFICATION_LINKS } from '@/lib/notification-links';
import { ROUTES } from '@/lib/routes';
import { sessionClient } from '@/lib/session-client';

/** The bell panel's push card (spec 00 §12.6). */
const PUSH_CARD_TEXT = 'Get notified about your orders on this device';

// The shared notification screens give back paths from this app's routes and link map: typed as `Route` here,
// in one place (as the sign-in screens provider).
function AppLink({ href, ...props }: NotificationLinkProps) {
  return <Link href={href as Route} {...props} />;
}

/**
 * The notification centre's configuration for this app (design 01 R-56), and the device's push clean-up:
 * unregistered before sign-out, unsubscribed locally whenever the session ends (design 01 §15.5, R-60).
 */
export function NotificationsKeeper({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const config = useMemo<NotificationsConfig>(
    () => ({
      api: browserApi,
      scope: APP.name,
      app: APP.name,
      linkMap: NOTIFICATION_LINKS,
      routes: { list: ROUTES.notifications, settings: ROUTES.notificationSettings },
      navigate: (url) => {
        router.push(url as Route);
      },
      Link: AppLink,
      pushCardText: PUSH_CARD_TEXT,
    }),
    [router],
  );

  useEffect(() => {
    const deps = { api: browserApi, app: APP.name, env: browserPushEnvironment() };
    return sessionClient.addSignOutHooks({
      beforeSignOut: () => unregisterPush(deps),
      onSessionEnd: () => {
        void unsubscribePushLocally(deps);
      },
    });
  }, []);

  return <NotificationsProvider config={config}>{children}</NotificationsProvider>;
}
