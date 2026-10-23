'use client';

import { useSyncExternalStore } from 'react';

const noSubscription = () => () => undefined;

/**
 * False in the server render and until React has hydrated the page, then true. Sign-in style forms keep their
 * submit button disabled until then: a click (or Enter) before hydration would make the browser submit the
 * form natively as a GET, putting the email and the password into the address bar, history and server logs.
 * A disabled default button also blocks implicit submission with Enter.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}
