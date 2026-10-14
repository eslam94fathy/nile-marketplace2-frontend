'use client';

import { SELLER_STATUS_LABELS } from '@nile/domain';
import { SELLER_STATUS_TONES, Skeleton, StatusBadge } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import { profileQuery } from '../api';

/** Header: business name and status badge (spec 02 §2.1). */
export function BusinessIdentity() {
  const profile = useQuery(profileQuery());
  if (profile.isPending) return <Skeleton className="h-5 w-40" />;
  if (profile.data === undefined) return null;
  return (
    <div className="flex min-w-0 items-center gap-2 text-sm">
      <span className="truncate font-medium">{profile.data.businessName}</span>
      <StatusBadge value={profile.data.status} labels={SELLER_STATUS_LABELS} tones={SELLER_STATUS_TONES} />
    </div>
  );
}
