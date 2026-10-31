'use client';

import { isApiError } from '@nile/api';
import { COUPON_DISPLAY_STATUS_LABELS } from '@nile/domain';
import {
  Badge,
  buttonVariants,
  COUPON_DISPLAY_STATUS_TONES,
  ErrorState,
  Notice,
  NotFoundScreen,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { profileQuery, useSellerAccess } from '@/features/profile';
import { ROUTES } from '@/lib/routes';
import { couponQuery, isCouponMissing } from '../api';
import { COUPONS_COPY as COPY } from '../copy';
import { discountText } from '../lib/display';
import { CouponForm } from './coupon-form';

/**
 * SE-22 New coupon: approved sellers only (others go back to `/coupons`, where the banner explains), as SE-09.
 */
export function NewCoupon() {
  const router = useRouter();
  const profile = useQuery(profileQuery());
  const access = useSellerAccess();
  const refusedByStatus = access.reason !== null;

  useEffect(() => {
    if (refusedByStatus) router.replace(ROUTES.coupons);
  }, [refusedByStatus, router]);

  if (profile.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.newCoupon} />
        <ErrorState
          message={COPY.profileFailed}
          onRetry={() => void profile.refetch()}
          correlationId={isApiError(profile.error) ? (profile.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (!access.catalog) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={COPY.newCoupon} />
        <Skeleton className="h-96 max-w-2xl" />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.newCoupon} />
      <CouponForm mode="create" />
    </div>
  );
}

/** SE-23 Coupon: summary, blocked banner and the edit form (read in every seller status, saved when approved). */
export function CouponView({ couponId }: { readonly couponId: string }) {
  const coupon = useQuery(couponQuery(couponId));

  if (coupon.isError) {
    if (isCouponMissing(coupon.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.coupons} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToCoupons}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void coupon.refetch()}
          correlationId={isApiError(coupon.error) ? (coupon.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (coupon.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-96 max-w-2xl" />
      </div>
    );
  }
  const data = coupon.data;
  return (
    <div className="space-y-6">
      <PageHeader
        title={data.code}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge
              value={data.displayStatus}
              labels={COUPON_DISPLAY_STATUS_LABELS}
              tones={COUPON_DISPLAY_STATUS_TONES}
            />
            {data.adminBlocked ? <Badge tone="warning">{COPY.blockedBadge}</Badge> : null}
            <span>{discountText(data)}</span>
            <span>· {COPY.usedTimes(data.redemptionCount)}</span>
          </span>
        }
      />
      {data.adminBlocked ? <Notice>{COPY.blocked(data.adminBlockReason ?? '')}</Notice> : null}
      {/* A newer answer (a save, a refetch after COUPON_LOCKED) resets the form to it. */}
      <CouponForm key={data.updatedAt} mode="edit" coupon={data} />
    </div>
  );
}
