'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import type { SessionClient } from './session-client';

/** Runs the proactive refresh timer and cross-tab messages while mounted. Mount once, in the root layout. */
export function SessionManager({ client }: { readonly client: SessionClient }) {
  useEffect(() => client.start(), [client]);
  return null;
}

export interface SessionExpiredBoundaryProps {
  readonly client: SessionClient;
  /** Shown while the session is being restored. */
  readonly pending: ReactNode;
  /** Shown when the refresh couldn't run (network, rate limit); `retry` tries again. */
  readonly failed: (retry: () => void) => ReactNode;
}

/**
 * Rendered by a protected Server Component instead of its content when the session's access token has
 * expired (Server Components never refresh, design 01 §5.1): refreshes through the coordinator, then
 * re-renders the route with the new cookie. A session that has ended navigates to sign-in by itself.
 */
export function SessionExpiredBoundary({ client, pending, failed }: SessionExpiredBoundaryProps) {
  const router = useRouter();
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'pending' | 'failed'>('pending');

  useEffect(() => {
    let active = true;
    void client.refresh().then((outcome) => {
      if (!active) return;
      if (outcome === 'ok') router.refresh();
      else if (outcome === 'transient') setStatus('failed');
    });
    return () => {
      active = false;
    };
  }, [client, router, attempt]);

  if (status === 'failed') {
    return failed(() => {
      setStatus('pending');
      setAttempt((value) => value + 1);
    });
  }
  return pending;
}
