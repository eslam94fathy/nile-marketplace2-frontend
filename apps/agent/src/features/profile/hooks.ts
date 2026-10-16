'use client';

import { isApiError } from '@nile/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { profileKeys, profileQuery } from './api';

/** The agent is inactive (spec 04 §2.2): every screen but Me shows the message instead of its content. */
export function useIsInactive(): boolean {
  const { data } = useQuery(profileQuery());
  return data?.status === 'inactive';
}

/**
 * For every agent request's error (OQ-12: `AGENT_INACTIVE` comes as 403 or 409): refetch the profile, so the
 * banner and the inactive screens follow, and return true; any other error returns false.
 */
export function useInactiveHandler(): (error: unknown) => boolean {
  const queryClient = useQueryClient();
  return useCallback(
    (error: unknown) => {
      if (!isApiError(error, 'AGENT_INACTIVE')) return false;
      void queryClient.invalidateQueries({ queryKey: profileKeys.profile() });
      return true;
    },
    [queryClient],
  );
}

/** The same for a query: when it fails with `AGENT_INACTIVE`, the profile is read again. */
export function useInactiveOnError(error: unknown): void {
  const handle = useInactiveHandler();
  useEffect(() => {
    if (error !== null) handle(error);
  }, [error, handle]);
}
