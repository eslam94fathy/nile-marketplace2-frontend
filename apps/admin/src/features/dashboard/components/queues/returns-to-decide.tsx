'use client';

import { inValues, unwrap } from '@nile/api';
import { formatDate, RETURN_STATUS_LABELS } from '@nile/domain';
import Link from 'next/link';
import { browserApi } from '@/lib/browser-api';
import { returnPath, ROUTES } from '@/lib/routes';
import { dashboardKeys } from '../../api';
import { DASHBOARD_COPY as COPY } from '../../copy';
import { dashboardQueueOptions, QueueCard, useQueueCard } from '../queue-card';

/** Returns only Nile can move on: escalated by the customer, disputed by the seller (spec 03 §7.3). */
const TO_DECIDE_STATUSES = ['escalated', 'disputed'] as const;

/** AD-02 card (T-M1): returns to decide, oldest first → AD-33; "See all" → AD-32. Live: `return.updated`. */
export function ReturnsToDecideQueue() {
  const card = useQueueCard(
    dashboardQueueOptions(dashboardKeys.returnsToDecide(), (limit, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/returns', {
          params: { query: { limit, sort: 'createdAt', 'status[in]': inValues(TO_DECIDE_STATUSES) } },
          signal,
        }),
      ),
    ),
  );
  return (
    <QueueCard
      title={COPY.returnsQueueTitle}
      seeAllHref={ROUTES.returns}
      seeAllLabel={COPY.returnsQueueSeeAll}
      getRowId={(item) => item.id}
      renderRow={(item) => (
        <span className="flex flex-wrap justify-between gap-2">
          <Link
            href={returnPath(item.id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {item.returnNumber}
          </Link>
          <span className="text-muted-foreground">
            {COPY.returnRow(RETURN_STATUS_LABELS.admin[item.status], formatDate(item.createdAt))}
          </span>
        </span>
      )}
      {...card}
    />
  );
}
