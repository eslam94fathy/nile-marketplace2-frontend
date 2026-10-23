'use client';

import { PageHeader } from '@nile/ui';
import type { ComponentType } from 'react';
import { DASHBOARD_COPY as COPY } from '../copy';
import { AgentsHoldingCodQueue } from './queues/agents-holding-cod';
import { AwaitingCardPaymentQueue } from './queues/awaiting-card-payment';
import { PendingSellersQueue } from './queues/pending-sellers';
import { RefundsToRecordQueue } from './queues/refunds-to-record';
import { UnassignedShipmentsQueue } from './queues/unassigned-shipments';

/** The five work queues, in spec 03 AD-02 order, each added by its task (T-H7, T-H9, T-H10, T-H11). */
export const DASHBOARD_QUEUES: readonly ComponentType[] = [
  PendingSellersQueue,
  UnassignedShipmentsQueue,
  RefundsToRecordQueue,
  AgentsHoldingCodQueue,
  AwaitingCardPaymentQueue,
];

/** AD-02 Dashboard: a grid of work-queue cards, each polled every 60 s while visible. */
export function Dashboard({ queues = DASHBOARD_QUEUES }: { readonly queues?: readonly ComponentType[] }) {
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      <div className="grid gap-4 lg:grid-cols-2">
        {queues.map((Queue, index) => (
          // The list is static (module constant), so the index is a stable key.
          <Queue key={index} />
        ))}
      </div>
    </div>
  );
}
