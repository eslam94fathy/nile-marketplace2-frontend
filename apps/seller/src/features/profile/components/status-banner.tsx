'use client';

import { Notice } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ROUTES } from '@/lib/routes';
import { profileQuery } from '../api';
import { bannerText, PROFILE_COPY } from '../copy';
import { ReapplyButton } from './reapply-button';

/**
 * The seller's status, on every portal page (spec 02 §2.2). Nothing while loading, when approved, or when the
 * profile can't be read (each screen shows its own errors). Rejected sellers get Re-apply (SE-07-A2) and,
 * away from the profile page, a link to update it first.
 */
export function StatusBanner() {
  const { data: profile } = useQuery(profileQuery());
  const pathname = usePathname();
  if (profile === undefined || profile.status === 'approved') return null;
  const text = bannerText(profile.status, profile.rejectionReason);
  if (profile.status !== 'rejected') return <Notice className="mb-6">{text}</Notice>;
  return (
    <Notice className="mb-6">
      <p>{text}</p>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <ReapplyButton />
        {pathname === ROUTES.profile ? null : (
          <Link href={ROUTES.profile} className="font-medium underline underline-offset-4">
            {PROFILE_COPY.updateProfile}
          </Link>
        )}
      </div>
    </Notice>
  );
}
