'use client';

import { SecurityScreen } from '@nile/auth-screens';
import { sessionClient } from '@/lib/session-client';

/** spec 04 AG-08: change password and sign out, with this app's session client. */
export function Security() {
  return <SecurityScreen sessionClient={sessionClient} />;
}
