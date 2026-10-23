'use client';

import { SecurityScreen } from '@nile/auth-screens';
import { sessionClient } from '@/lib/session-client';

/** spec 03 AD-23: change password and sign out, with this app's session client. */
export function Security() {
  return <SecurityScreen sessionClient={sessionClient} />;
}
