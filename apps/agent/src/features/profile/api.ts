import { unwrap, type Schema } from '@nile/api';
import { queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { browserApi } from '@/lib/browser-api';

// The agent's profile and status (spec 04 §2.2, AG-02, AG-03; design 02 §2.5 `profile`).

export type AgentProfile = Schema<'AgentProfileDto'>;

/** Design 02 §2.5: 1 min, and read again on focus. */
const PROFILE_STALE_TIME_MS = 60_000;

export const profileKeys = { profile: () => queryKey('agent', 'profile', 'detail') };

/** Loaded at start and on focus: the status decides what the agent sees (spec 04 §2.2). */
export function profileQuery() {
  return queryOptions({
    queryKey: profileKeys.profile(),
    queryFn: async ({ signal }) => (await unwrap(browserApi.GET('/api/v1/agent/profile', { signal }))).data,
    staleTime: PROFILE_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  });
}

/** AG-03: the answer is the profile; the switch shows only what the API returned. */
export async function setOnShift(onShift: boolean): Promise<AgentProfile> {
  return (await unwrap(browserApi.PATCH('/api/v1/agent/availability', { body: { onShift } }))).data;
}
