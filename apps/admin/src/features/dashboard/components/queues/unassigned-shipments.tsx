'use client';

import { unwrap } from '@nile/api';
import { formatDate } from '@nile/domain';
import Link from 'next/link';
import { useGovernorateName } from '@/features/lookups';
import { SHIPMENTS_COPY, shipmentKeys } from '@/features/shipments';
import { browserApi } from '@/lib/browser-api';
import { ROUTES, shipmentPath } from '@/lib/routes';
import { dashboardQueueOptions, QueueCard, useQueueCard } from '../queue-card';

/** AD-02 queue 2 (T-H9): unassigned shipments, oldest first → AD-13; "See all" → the Unassigned tab. */
export function UnassignedShipmentsQueue() {
  const governorates = useGovernorateName();
  const card = useQueueCard(
    dashboardQueueOptions(shipmentKeys.dashboard(), (limit, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/shipments', {
          params: { query: { limit, sort: 'createdAt', 'status[eq]': 'unassigned' } },
          signal,
        }),
      ),
    ),
  );
  return (
    <QueueCard
      title={SHIPMENTS_COPY.queueTitle}
      seeAllHref={ROUTES.shipments}
      seeAllLabel={SHIPMENTS_COPY.queueSeeAll}
      getRowId={(shipment) => shipment.id}
      renderRow={(shipment) => (
        <span className="flex flex-wrap justify-between gap-2">
          <Link
            href={shipmentPath(shipment.id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {SHIPMENTS_COPY.orderNumber(shipment.orderNumber)}
          </Link>
          <span className="text-muted-foreground">
            {SHIPMENTS_COPY.queueRow(
              governorates.name(shipment.pickup.governorateId),
              formatDate(shipment.createdAt),
            )}
          </span>
        </span>
      )}
      {...card}
    />
  );
}
