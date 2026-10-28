'use client';

import type { ApiClient, BffApp } from '@nile/api';
import type { NotificationLinkMap } from '@nile/domain';
import type { QueryScope } from '@nile/query';
import { createContext, use, type ReactNode } from 'react';
import type { PushEnvironment } from './push';

// What each app gives the shared notification screens (design 01 §15.1, R-56, the R-24 pattern). The screens
// stay free of Next.js: the app passes its typed browser client, routes, link map, navigate and `Link`.

export interface NotificationLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly onClick?: () => void;
  readonly 'aria-current'?: 'page' | 'true';
  readonly children: ReactNode;
}

export interface NotificationsConfig {
  /** The app's browser client (every call through its BFF). */
  readonly api: ApiClient;
  /** First query-key segment of this app's private data. */
  readonly scope: Exclude<QueryScope, 'public'>;
  /** Names this app's per-device storage keys. */
  readonly app: BffApp;
  /** API link → app path (spec 00 §12.5). */
  readonly linkMap: NotificationLinkMap;
  readonly routes: {
    /** The notifications page (SF-32, SE-27, AD-40, AG-09). */
    readonly list: string;
    /** Notification settings (SF-33, SE-28, AD-41, AG-10). */
    readonly settings: string;
  };
  /** In-app navigation (the app's router). */
  readonly navigate: (url: string) => void;
  /** The app's `Link`, so in-app links stay client-side navigations. */
  readonly Link: (props: NotificationLinkProps) => ReactNode;
  /** The bell panel's push card; null hides it (the agent app shows its own card on Shipments, AG-Q-8). */
  readonly pushCardText: string | null;
  /** Tests only: a simulated browser for Web Push. */
  readonly pushEnvironment?: PushEnvironment;
}

const NotificationsContext = createContext<NotificationsConfig | null>(null);

export function NotificationsProvider({
  config,
  children,
}: {
  readonly config: NotificationsConfig;
  readonly children: ReactNode;
}) {
  return <NotificationsContext value={config}>{children}</NotificationsContext>;
}

export function useNotificationsConfig(): NotificationsConfig {
  const config = use(NotificationsContext);
  if (config === null)
    throw new Error('Notification screens need a <NotificationsProvider> (design 01 R-56)');
  return config;
}
