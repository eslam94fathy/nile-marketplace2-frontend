'use client';

import { fetchRealtimeToken } from '@nile/auth/client';
import { notificationsInvalidation } from '@nile/notifications';
import { type InvalidationMap, RealtimeProvider } from '@nile/realtime';
import { supportInvalidation } from '@nile/support-screens';
import { usePathname } from 'next/navigation';
import { dashboardKeys } from '@/features/dashboard';
import { type ReactNode, useSyncExternalStore } from 'react';
import { APP } from '@/lib/app';
import { publicEnv } from '@/lib/env/public';
import { sessionClient } from '@/lib/session-client';

const support = supportInvalidation(APP.name);

/**
 * Notifications from T-J6, the dashboard cards from T-M1, the support console from T-M5 (design 02 §5.3). One
 * handler per message type: a message that several features own lists every key it touches; T-M7 adds the
 * returns keys to the return handler.
 */
const INVALIDATION_MAP: InvalidationMap = {
  ...notificationsInvalidation(APP.name),
  ...support,
  // The figures count tickets too, so the whole dashboard is read again.
  'support.ticket_updated': (data) => [...support['support.ticket_updated'](data), dashboardKeys.all()],
  'return.updated': () => [dashboardKeys.returnsToDecide()],
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
