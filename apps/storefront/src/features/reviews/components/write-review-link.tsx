'use client';

import { buttonVariants } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { MY_REVIEWS_COPY } from '../copy';
import { writeReviewPath } from '../lib/routes';
import { allReviewableQuery } from '../my-api';

/**
 * SF-18 "Write a review" next to an order item that `GET /me/reviewable-items` lists (SF-Q-16). Nothing while
 * the list loads or when it fails: the item stays reviewable from SF-24. `enabled` limits the read to orders
 * with a delivered parcel.
 */
export function WriteReviewLink({
  orderItemId,
  productName,
  enabled,
}: {
  readonly orderItemId: string;
  readonly productName: string;
  readonly enabled: boolean;
}) {
  const items = useQuery({ ...allReviewableQuery(), enabled });
  if (!items.data?.some((item) => item.orderItemId === orderItemId)) return null;
  return (
    <Link
      href={writeReviewPath(orderItemId)}
      aria-label={MY_REVIEWS_COPY.writeReviewFor(productName)}
      className={buttonVariants({ variant: 'outline', size: 'sm' })}
    >
      {MY_REVIEWS_COPY.writeReview}
    </Link>
  );
}
