'use client';

import { unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions, useQueries } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { browserApi } from '@/lib/browser-api';

// Delivery agents as the other admin screens see them (spec 03 §2.2, AD-Q-3): one key family shared by the
// agents and shipments features, so an assignment can refresh every agent view at once.

export type AdminAgent = Schema<'AdminAgentDto'>;

/** AD-Q-3: an agent's name on a shipment list is read once per id and kept 5 min. */
const AGENT_NAME_STALE_MS = 5 * 60_000;

export const agentKeys = {
  /** Every agent query (lists, details, names, the assign dialog's list). */
  all: () => ['admin', 'agents'] as const,
  lists: () => queryKey('admin', 'agents', 'list'),
  list: <F extends object>(filters: F) => queryKey('admin', 'agents', 'list', filters),
  detail: (agentId: string) => queryKey('admin', 'agents', 'detail', { agentId }),
  byId: (agentId: string) => queryKey('admin', 'agents', 'byId', { agentId }),
  picker: () => queryKey('admin', 'agents', 'picker'),
  assignable: () => queryKey('admin', 'agents', 'assignable'),
};

/** The API's largest page (conventions: max 100): pickers show every agent of a small fleet at once. */
const AGENT_PICKER_SIZE = 100;

async function fetchAgent(agentId: string, signal: AbortSignal): Promise<AdminAgent> {
  return (
    await unwrap(
      browserApi.GET('/api/v1/admin/delivery-agents/{agentId}', { params: { path: { agentId } }, signal }),
    )
  ).data;
}

/** AD-11: stale 0 (design 02 §2.4). */
export function agentQuery(agentId: string) {
  return queryOptions({
    queryKey: agentKeys.detail(agentId),
    queryFn: ({ signal }) => fetchAgent(agentId, signal),
    staleTime: 0,
  });
}

/** AD-12 agent filter: every agent, newest first (one page of 100; more only lose the option). */
export function agentPickerQuery() {
  return queryOptions({
    queryKey: agentKeys.picker(),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/delivery-agents', {
            params: { query: { limit: AGENT_PICKER_SIZE, sort: '-createdAt' } },
            signal,
          }),
        )
      ).data,
    staleTime: AGENT_NAME_STALE_MS,
  });
}

/** AD-13 assign dialog: active agents only (spec 03), read fresh each time the dialog opens. */
export function assignableAgentsOptions() {
  return infiniteListOptions({
    queryKey: agentKeys.assignable(),
    fetchPage: (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/delivery-agents', {
          params: {
            query: {
              limit: AGENT_PICKER_SIZE,
              sort: '-createdAt',
              'status[eq]': 'active',
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
    staleTime: 0,
  });
}

function agentNameQuery(agentId: string) {
  return queryOptions({
    queryKey: agentKeys.byId(agentId),
    queryFn: ({ signal }) => fetchAgent(agentId, signal),
    staleTime: AGENT_NAME_STALE_MS,
    // A missing agent only costs the name: the short id is shown instead.
    retry: false,
  });
}

/** Agent id → full name for the ids on screen, one request per unique id; null while unknown. */
export function useAgentNames(agentIds: readonly (string | null)[]) {
  const unique = useMemo(
    () => [...new Set(agentIds.filter((id): id is string => id !== null))].sort(),
    [agentIds],
  );
  const names = useQueries({
    queries: unique.map((id) => agentNameQuery(id)),
    combine: (results) =>
      new Map(
        results.flatMap((result) =>
          result.data === undefined ? [] : [[result.data.id, result.data.fullName]],
        ),
      ),
  });
  return useCallback((agentId: string): string | null => names.get(agentId) ?? null, [names]);
}
