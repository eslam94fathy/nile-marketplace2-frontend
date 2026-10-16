'use client';

import { FormAlert, Notice, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { profileQuery } from '../api';
import { PROFILE_COPY as COPY } from '../copy';
import { useIsInactive } from '../hooks';

/** The shell's banner while the agent is inactive (spec 04 §2.2). */
export function InactiveBanner() {
  return useIsInactive() ? <FormAlert className="rounded-none border-x-0">{COPY.inactive}</FormAlert> : null;
}

/**
 * Every screen except Me (spec 04 §2.2): waits for the profile, then shows the message instead of the content
 * while the agent is inactive, so no screen sends requests the backend refuses. If the profile can't be read,
 * the screen goes ahead (its own requests report `AGENT_INACTIVE` if needed).
 */
export function InactiveGate({ children }: { readonly children: ReactNode }) {
  const profile = useQuery(profileQuery());
  if (profile.isPending) return <Skeleton className="h-40" />;
  if (profile.data?.status === 'inactive') return <Notice>{COPY.inactive}</Notice>;
  return <>{children}</>;
}
