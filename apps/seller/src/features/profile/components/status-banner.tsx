'use client';

import { Notice } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { profileQuery } from '../api';
import { PROFILE_COPY } from '../copy';

/**
 * The seller's status, on every portal page (spec 02 §2.2). Nothing while loading, when approved, or when the
 * profile can't be read (each screen shows its own errors). Re-apply (SE-07 A2) arrives with phase h.
 */
export function StatusBanner() {
  const { data: profile } = useQuery(profileQuery());
  if (profile === undefined || profile.status === 'approved') return null;
  if (profile.status === 'rejected') {
    return (
      <Notice className="mb-6">
        <p>{PROFILE_COPY.banners.rejected(profile.rejectionReason ?? null)}</p>
        <Link href={ROUTES.profile} className="font-medium underline underline-offset-4">
          {PROFILE_COPY.updateProfile}
        </Link>
      </Notice>
    );
  }
  return <Notice className="mb-6">{PROFILE_COPY.banners[profile.status]}</Notice>;
}
