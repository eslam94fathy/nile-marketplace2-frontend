'use client';

import { unwrap } from '@nile/api';
import { formatDate } from '@nile/domain';
import Link from 'next/link';
import { SELLERS_COPY, sellerKeys } from '@/features/sellers';
import { browserApi } from '@/lib/browser-api';
import { ROUTES, sellerPath } from '@/lib/routes';
import { dashboardQueueOptions, QueueCard, useQueueCard } from '../queue-card';

/** AD-02 queue 1 (T-H7): sellers waiting for approval, oldest first → AD-05; "See all" → the Pending tab. */
export function PendingSellersQueue() {
  const card = useQueueCard(
    dashboardQueueOptions(sellerKeys.dashboard(), (limit, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/sellers', {
          params: { query: { limit, sort: 'createdAt', 'status[eq]': 'pending_approval' } },
          signal,
        }),
      ),
    ),
  );
  return (
    <QueueCard
      title={SELLERS_COPY.queueTitle}
      seeAllHref={ROUTES.sellers}
      seeAllLabel={SELLERS_COPY.queueSeeAll}
      getRowId={(seller) => seller.id}
      renderRow={(seller) => (
        <span className="flex flex-wrap justify-between gap-2">
          <Link
            href={sellerPath(seller.id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {seller.businessName}
          </Link>
          <span className="text-muted-foreground">
            {SELLERS_COPY.registeredOn(formatDate(seller.createdAt))}
          </span>
        </span>
      )}
      {...card}
    />
  );
}
