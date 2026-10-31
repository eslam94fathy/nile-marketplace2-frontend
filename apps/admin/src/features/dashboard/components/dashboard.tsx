'use client';

import { PageHeader } from '@nile/ui';
import type { ComponentType } from 'react';
import { DASHBOARD_COPY as COPY } from '../copy';
import { AgentsHoldingCodQueue } from './queues/agents-holding-cod';
import { DashboardFigures } from './dashboard-figures';
import { AwaitingCardPaymentQueue } from './queues/awaiting-card-payment';
import { PendingSellersQueue } from './queues/pending-sellers';
import { RefundsToRecordQueue } from './queues/refunds-to-record';
import { ReturnsToDecideQueue } from './queues/returns-to-decide';
import { TicketsWaitingQueue } from './queues/tickets-waiting';
import { UnassignedShipmentsQueue } from './queues/unassigned-shipments';

/** The five R1 work queues in spec 03 AD-02 order (T-H7, T-H9, T-H10, T-H11), then the R2 cards (T-M1). */
export const DASHBOARD_QUEUES: readonly ComponentType[] = [
  PendingSellersQueue,
  UnassignedShipmentsQueue,
  RefundsToRecordQueue,
  AgentsHoldingCodQueue,
  AwaitingCardPaymentQueue,
  TicketsWaitingQueue,
  ReturnsToDecideQueue,
];

/** AD-02 Dashboard: the "Today" figures (T-M1), then a grid of work-queue cards. */
export function Dashboard({
  queues = DASHBOARD_QUEUES,
  figures = true,
}: {
  readonly queues?: readonly ComponentType[];
  /** Off only in tests of the frame. */
  readonly figures?: boolean;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      {figures ? <DashboardFigures /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {queues.map((Queue, index) => (
          // The list is static (module constant), so the index is a stable key.
          <Queue key={index} />
        ))}
      </div>
    </div>
  );
}
