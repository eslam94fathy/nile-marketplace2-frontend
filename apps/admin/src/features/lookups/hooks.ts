'use client';

import { ACTOR_ROLE_LABELS, type ActorRole } from '@nile/domain';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { adminDirectoryQuery, adminGovernoratesQuery } from './api';

export const YOU = 'you';

/**
 * Who did something (AD-Q-2): "you" for the signed-in admin, an admin's email when the id is in the admins
 * list, otherwise the role label the caller knows for that entry (or "System" when there is no actor).
 */
export function useActorLabel(currentUserId: string) {
  const directory = useQuery(adminDirectoryQuery());
  const emails = useMemo(
    () => new Map((directory.data ?? []).map((admin) => [admin.id, admin.email])),
    [directory.data],
  );
  return useCallback(
    (actorUserId: string | null, role: ActorRole): string => {
      if (actorUserId === null) return ACTOR_ROLE_LABELS.system;
      if (actorUserId === currentUserId) return YOU;
      return emails.get(actorUserId) ?? ACTOR_ROLE_LABELS[role];
    },
    [currentUserId, emails],
  );
}

/** Governorate id → name; the id itself while the list loads or for an unknown id. */
export function useGovernorateName() {
  const governorates = useQuery(adminGovernoratesQuery());
  const names = useMemo(
    () => new Map((governorates.data ?? []).map((governorate) => [governorate.id, governorate.name])),
    [governorates.data],
  );
  return {
    name: useCallback((id: string) => names.get(id) ?? id, [names]),
    governorates: governorates.data ?? [],
    loading: governorates.isPending,
  };
}
