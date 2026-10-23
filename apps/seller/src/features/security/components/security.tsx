'use client';

import { SecurityScreen } from '@nile/auth-screens';
import { sessionClient } from '@/lib/session-client';

/** spec 02 SE-17: change password and sign out, with this app's session client. */
export function Security() {
  return <SecurityScreen sessionClient={sessionClient} />;
}
