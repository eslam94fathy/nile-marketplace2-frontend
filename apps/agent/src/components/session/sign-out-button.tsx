'use client';

import { Button, UI_COPY } from '@nile/ui';
import { LogOut } from 'lucide-react';
import { sessionClient } from '@/lib/session-client';

/** Ends the session in every tab of the app (design 01 §5.3) and returns to sign-in. */
export function SignOutButton() {
  return (
    <Button
      variant="outline"
      onClick={() => {
        void sessionClient.signOut();
      }}
    >
      <LogOut aria-hidden="true" />
      {UI_COPY.signOut}
    </Button>
  );
}
