'use client';

import { unwrap } from '@nile/api';
import { formatDate, formatMoney, REFUND_REASON_LABELS } from '@nile/domain';
import Link from 'next/link';
import { PAYMENTS_COPY, paymentKeys } from '@/features/payments';
import { browserApi } from '@/lib/browser-api';
import { refundPath, ROUTES } from '@/lib/routes';
import { dashboardQueueOptions, QueueCard, useQueueCard } from '../queue-card';

/** AD-02 queue 3 (T-H10): refunds needing action, oldest first → AD-34 (T-M8); "See all" → AD-16 "Needs action". */
export function RefundsToRecordQueue() {
  const card = useQueueCard(
    dashboardQueueOptions(paymentKeys.dashboard(), (limit, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/payments/refunds', {
          params: { query: { limit, sort: 'createdAt', 'status[eq]': 'pending_manual' } },
          signal,
        }),
      ),
    ),
  );
  return (
    <QueueCard
      title={PAYMENTS_COPY.queueTitle}
      seeAllHref={ROUTES.refunds}
      seeAllLabel={PAYMENTS_COPY.queueSeeAll}
      getRowId={(refund) => refund.id}
      renderRow={(refund) => (
        <span className="flex flex-wrap justify-between gap-2">
          <Link
            href={refundPath(refund.id)}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {formatMoney(refund.amount)}
          </Link>
          <span className="text-muted-foreground">
            {PAYMENTS_COPY.queueRow(REFUND_REASON_LABELS[refund.reason], formatDate(refund.createdAt))}
          </span>
        </span>
      )}
      {...card}
    />
  );
}
