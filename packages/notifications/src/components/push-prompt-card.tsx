'use client';

import { Button, cn } from '@nile/ui';
import { BellRing, X } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { useNotificationsConfig } from '../config';
import { PUSH_COPY } from '../copy';
import { pushStorageKeys } from '../push';
import { usePushEnvironment, usePushSubscription } from '../use-push';

const DISMISSED = '1';
/** Storage has no change events within a tab; this card is the only writer. */
const noSubscription = () => () => undefined;

export interface PushPromptCardProps {
  /** "Get notified about your orders on this device" etc., per app (spec 00 §12.6, AG-Q-8). */
  readonly text: string;
  readonly className?: string;
}

/**
 * The one-time, dismissible invitation to turn push on (spec 00 §12.6). Shown only while push is possible
 * and off on this device; dismissing it is remembered per device. Never asks on its own: the browser prompt
 * comes only from the "Turn on" click.
 */
export function PushPromptCard({ text, className }: PushPromptCardProps) {
  const { app } = useNotificationsConfig();
  const env = usePushEnvironment();
  const push = usePushSubscription();
  const key = pushStorageKeys(app).cardDismissed;
  // Treated as dismissed while rendering on the server, where there is no storage.
  const storedDismissal = useSyncExternalStore(
    noSubscription,
    () => env.storage.get(key) === DISMISSED,
    () => true,
  );
  const [dismissedNow, setDismissedNow] = useState(false);
  const dismissed = storedDismissal || dismissedNow;

  if (dismissed || push.state !== 'off') return null;

  return (
    <div className={cn('flex gap-3 rounded-md border border-border bg-muted p-3 text-sm', className)}>
      <BellRing aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p>{text}</p>
        {push.error === null ? null : (
          <p role="alert" className="text-destructive">
            {push.error}
          </p>
        )}
        <div>
          <Button size="sm" loading={push.busy} onClick={() => void push.enable()}>
            {PUSH_COPY.cardTurnOn}
          </Button>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0"
        aria-label={PUSH_COPY.cardDismiss}
        onClick={() => {
          env.storage.set(key, DISMISSED);
          setDismissedNow(true);
        }}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
