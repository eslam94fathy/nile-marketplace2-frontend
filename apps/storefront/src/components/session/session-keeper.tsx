'use client';

import { SessionManager } from '@nile/auth/client';
import { sessionClient } from '@/lib/session-client';

/** Keeps the session fresh while a page is open (proactive refresh, cross-tab sign-out). */
export function SessionKeeper() {
  return <SessionManager client={sessionClient} />;
}
