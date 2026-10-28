'use client';

import type { RealtimeMessage, RealtimeMessageData, RealtimeMessageType } from '@nile/api';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import {
  createRealtimeConnection,
  type CreateSocket,
  type RealtimeConnection,
  type RealtimeStatus,
  type RefreshOutcome,
} from './connection';

// Mounted once per app, inside the QueryProvider (design 01 §15.3, design 02 §5.3). A message invalidates the
// query prefixes of the app's map; after every (re)connect every query of the app's scope is refetched.

/** Query prefixes to invalidate per message, from its `data` (design 02 §5.3). */
export type InvalidationMap = {
  readonly [T in RealtimeMessageType]?: (data: RealtimeMessageData[T]) => readonly QueryKey[];
};

/** Close the socket after this long hidden; reopen (and refetch) when the tab is shown again (DQ-10). */
export const HIDDEN_CLOSE_MS = 5 * 60_000;
/** Several messages or a reconnect in a burst cause one refetch round. */
export const REFETCH_DEBOUNCE_MS = 250;

type Listener = (message: RealtimeMessage) => void;

interface RealtimeContextValue {
  readonly subscribeStatus: (onChange: () => void) => () => void;
  readonly getStatus: () => RealtimeStatus;
  readonly addListener: (listener: Listener) => () => void;
  readonly connection: () => RealtimeConnection | null;
}

const OFF: RealtimeContextValue = {
  subscribeStatus: () => () => undefined,
  getStatus: () => 'idle',
  addListener: () => () => undefined,
  connection: () => null,
};

const RealtimeContext = createContext<RealtimeContextValue>(OFF);

export interface RealtimeProviderProps {
  /** `NEXT_PUBLIC_REALTIME_URL`. */
  readonly url: string;
  /** A session exists in this browser; without one there is no socket. */
  readonly enabled: boolean;
  /** `fetchRealtimeToken` from `@nile/auth/client`, unwrapped to the token. */
  readonly fetchToken: () => Promise<string>;
  /** The app's session coordinator. */
  readonly refresh: () => Promise<RefreshOutcome>;
  readonly signOut: () => void;
  /** First query-key segment of this app's private data (`storefront`, `seller`, …). */
  readonly scope: string;
  readonly invalidationMap: InvalidationMap;
  readonly onWarn?: (code: string) => void;
  /** Tests only. */
  readonly createSocket?: CreateSocket;
  readonly children: ReactNode;
}

export function RealtimeProvider({
  url,
  enabled,
  fetchToken,
  refresh,
  signOut,
  scope,
  invalidationMap,
  onWarn,
  createSocket,
  children,
}: RealtimeProviderProps) {
  const queryClient = useQueryClient();
  const statusListeners = useRef(new Set<() => void>());
  const messageListeners = useRef(new Set<Listener>());
  const statusRef = useRef<RealtimeStatus>('idle');
  const connectionRef = useRef<RealtimeConnection | null>(null);
  // Latest props for the long-lived connection callbacks.
  const latest = useRef({ fetchToken, refresh, signOut, scope, invalidationMap, onWarn });
  useEffect(() => {
    latest.current = { fetchToken, refresh, signOut, scope, invalidationMap, onWarn };
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const statusSubscribers = statusListeners.current;
    let refetchTimer: ReturnType<typeof setTimeout> | null = null;
    const pending: QueryKey[] = [];
    let refetchAll = false;

    const flush = () => {
      refetchTimer = null;
      if (refetchAll) {
        const appScope = latest.current.scope;
        void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === appScope });
      } else {
        for (const queryKey of pending) void queryClient.invalidateQueries({ queryKey });
      }
      refetchAll = false;
      pending.length = 0;
    };
    const schedule = () => {
      refetchTimer ??= setTimeout(flush, REFETCH_DEBOUNCE_MS);
    };

    const connection = createRealtimeConnection({
      url,
      fetchToken: () => latest.current.fetchToken(),
      refresh: () => latest.current.refresh(),
      signOut: () => {
        latest.current.signOut();
      },
      onStatus: (status) => {
        statusRef.current = status;
        for (const listener of statusSubscribers) listener();
      },
      onConnected: () => {
        refetchAll = true;
        schedule();
      },
      onMessage: (message) => {
        const keysOf = latest.current.invalidationMap[message.type] as
          ((data: RealtimeMessage['data']) => readonly QueryKey[]) | undefined;
        const keys = keysOf?.(message.data) ?? [];
        if (keys.length > 0) {
          pending.push(...keys);
          schedule();
        }
        for (const listener of messageListeners.current) listener(message);
      },
      onWarn: (code) => latest.current.onWarn?.(code),
      ...(createSocket === undefined ? {} : { createSocket }),
    });
    connectionRef.current = connection;

    let hiddenTimer: ReturnType<typeof setTimeout> | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenTimer ??= setTimeout(() => {
          hiddenTimer = null;
          connection.stop();
        }, HIDDEN_CLOSE_MS);
        return;
      }
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
      hiddenTimer = null;
      connection.start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    if (document.visibilityState !== 'hidden') connection.start();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (hiddenTimer !== null) clearTimeout(hiddenTimer);
      if (refetchTimer !== null) clearTimeout(refetchTimer);
      connection.stop();
      connectionRef.current = null;
      statusRef.current = 'idle';
      for (const listener of statusSubscribers) listener();
    };
  }, [createSocket, enabled, queryClient, url]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      subscribeStatus: (onChange) => {
        statusListeners.current.add(onChange);
        return () => {
          statusListeners.current.delete(onChange);
        };
      },
      getStatus: () => statusRef.current,
      addListener: (listener) => {
        messageListeners.current.add(listener);
        return () => {
          messageListeners.current.delete(listener);
        };
      },
      connection: () => connectionRef.current,
    }),
    [],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** `connected` while messages arrive; polling defined by the specs runs only otherwise (design 01 §15.3). */
export function useRealtimeStatus(): RealtimeStatus {
  const { subscribeStatus, getStatus } = useContext(RealtimeContext);
  return useSyncExternalStore(subscribeStatus, getStatus, () => 'idle');
}

/** True while the socket is connected: queries drop their fallback polling. */
export function useRealtimeConnected(): boolean {
  return useRealtimeStatus() === 'connected';
}

/** Runs after the invalidation map for each message of `type` (announcements, toasts). */
export function useRealtimeMessage<T extends RealtimeMessageType>(
  type: T,
  handler: (message: RealtimeMessage<T>) => void,
): void {
  const { addListener } = useContext(RealtimeContext);
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(
    () =>
      addListener((message) => {
        if (message.type === type) latest.current(message as RealtimeMessage<T>);
      }),
    [addListener, type],
  );
}

/** Internal: the live connection, for the ticket room and typing signals. */
export function useRealtimeConnection(): () => RealtimeConnection | null {
  return useContext(RealtimeContext).connection;
}

/** Stable callback that reads the connection at call time. */
export function useConnectionCallback<A extends unknown[]>(
  run: (connection: RealtimeConnection, ...args: A) => void,
): (...args: A) => void {
  const connection = useRealtimeConnection();
  const latest = useRef(run);
  useEffect(() => {
    latest.current = run;
  });
  return useCallback(
    (...args: A) => {
      const current = connection();
      if (current !== null) latest.current(current, ...args);
    },
    [connection],
  );
}
