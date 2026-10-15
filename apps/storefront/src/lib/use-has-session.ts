'use client';

import { useSyncExternalStore } from 'react';
import { sessionClient } from '@/lib/session-client';

const noSubscription = () => () => undefined;

/**
 * Whether this browser holds a session (the readable session-version cookie). False while rendering on the
 * server and during hydration, then the real value: catalog pages stay user-independent (spec 01 §2.2).
 */
export function useHasSession(): boolean {
  return useSyncExternalStore(noSubscription, sessionClient.hasSession, () => false);
}
