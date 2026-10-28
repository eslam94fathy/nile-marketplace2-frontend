'use client';

import { Button, FormAlert, LoadingRegion, Notice, Skeleton } from '@nile/ui';
import { useId } from 'react';
import { PUSH_COPY } from '../copy';
import type { PushState } from '../push';
import { usePushSubscription } from '../use-push';

/** Why push can't be turned on here (spec 00 §12.6). */
const BLOCKED: Partial<Record<PushState, string>> = {
  unsupported: PUSH_COPY.unsupported,
  denied: PUSH_COPY.denied,
  'needs-install': PUSH_COPY.needsInstall,
};

/** "This device": turn push on (only from this click) or off, or why it isn't possible. */
export function PushDeviceSection() {
  const push = usePushSubscription();
  const headingId = useId();
  const blocked = BLOCKED[push.state];

  let content;
  if (push.state === 'checking') {
    content = (
      <LoadingRegion>
        <Skeleton className="h-10 w-72" />
      </LoadingRegion>
    );
  } else if (blocked !== undefined) {
    content = <Notice>{blocked}</Notice>;
  } else if (push.state === 'on') {
    content = (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">{PUSH_COPY.on}</p>
        <Button variant="outline" loading={push.busy} onClick={() => void push.disable()}>
          {PUSH_COPY.turnOff}
        </Button>
      </div>
    );
  } else {
    content = (
      <div className="space-y-3">
        <Button loading={push.busy} onClick={() => void push.enable()}>
          {PUSH_COPY.turnOn}
        </Button>
        {push.error === null ? null : <FormAlert>{push.error}</FormAlert>}
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {PUSH_COPY.deviceHeading}
      </h2>
      {content}
    </section>
  );
}
