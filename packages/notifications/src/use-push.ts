'use client';

import { ApiError } from '@nile/api';
import { errorMessage } from '@nile/query';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { pushConfigQuery } from './api';
import { useNotificationsConfig } from './config';
import { PUSH_COPY } from './copy';
import {
  browserPushEnvironment,
  enablePush,
  readPushState,
  unregisterPush,
  type PushEnvironment,
  type PushState,
} from './push';

export interface PushSubscriptionControls {
  readonly state: PushState;
  /** A turn-on or turn-off is running. */
  readonly busy: boolean;
  /** Why the last turn-on failed, for the screen. */
  readonly error: string | null;
  readonly enable: () => Promise<void>;
  readonly disable: () => Promise<void>;
}

function enableFailure(error: unknown): string {
  if (error instanceof ApiError) {
    return errorMessage(error, { PUSH_ENDPOINT_NOT_ALLOWED: PUSH_COPY.endpointNotAllowed });
  }
  return PUSH_COPY.failed;
}

/** The browser's Web Push (or the test's simulated one). */
export function usePushEnvironment(): PushEnvironment {
  const { pushEnvironment } = useNotificationsConfig();
  return useMemo(() => pushEnvironment ?? browserPushEnvironment(), [pushEnvironment]);
}

/** This device's push state and the actions on it (spec 00 §12.6). */
export function usePushSubscription(): PushSubscriptionControls {
  const { api, app, scope } = useNotificationsConfig();
  const queryClient = useQueryClient();
  const env = usePushEnvironment();
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void readPushState(env).then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [env]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    const outcome = await enablePush(
      { api, app, env },
      async () => (await queryClient.query(pushConfigQuery(api, scope))).vapidPublicKey,
    );
    setState(outcome.state);
    if (outcome.state === 'off' && outcome.error !== null) setError(enableFailure(outcome.error));
    setBusy(false);
  }, [api, app, env, queryClient, scope]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    await unregisterPush({ api, app, env });
    setState(await readPushState(env));
    setBusy(false);
  }, [api, app, env]);

  return { state, busy, error, enable, disable };
}
