'use client';

import { fetchRealtimeToken } from '@nile/auth/client';
import { notificationsInvalidation } from '@nile/notifications';
import { type InvalidationMap, RealtimeProvider } from '@nile/realtime';
import { usePathname } from 'next/navigation';
import { type ReactNode, useSyncExternalStore } from 'react';
import { ORDERS_INVALIDATION } from '@/features/orders';
import { APP } from '@/lib/app';
import { publicEnv } from '@/lib/env/public';
import { sessionClient } from '@/lib/session-client';

/** This app's message → query map (design 02 §5.3); each feature owns its part. */
const INVALIDATION_MAP: InvalidationMap = {
  ...ORDERS_INVALIDATION,
  ...notificationsInvalidation(APP.name),
};

const noSubscription = () => () => undefined;
const fetchToken = async () => (await fetchRealtimeToken()).token;
const signOut = () => {
  void sessionClient.signOut('session-ended');
};
const warn = (code: string) => {
  // No client log sink until T-I4 (FQ-10, as R-42): a configuration problem (origin, profile) shows here.
  // eslint-disable-next-line no-console -- the only client-side report available before T-I4
  console.warn('Realtime connection refused', code);
};

/**
 * The socket for this tab while a session exists (design 01 §15.3). The session cookie is read again on every
 * navigation, so signing in or out in this tab opens or closes the socket.
 */
export function RealtimeKeeper({ children }: { readonly children: ReactNode }) {
  usePathname();
  const signedIn = useSyncExternalStore(noSubscription, sessionClient.hasSession, () => false);
  return (
    <RealtimeProvider
      url={publicEnv.NEXT_PUBLIC_REALTIME_URL}
      enabled={signedIn}
      fetchToken={fetchToken}
      refresh={sessionClient.refresh}
      signOut={signOut}
      scope={APP.name}
      invalidationMap={INVALIDATION_MAP}
      onWarn={warn}
    >
      {children}
    </RealtimeProvider>
  );
}
