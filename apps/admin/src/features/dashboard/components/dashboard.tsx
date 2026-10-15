'use client';

import { PageHeader } from '@nile/ui';
import type { ComponentType } from 'react';
import { DASHBOARD_COPY as COPY } from '../copy';

/**
 * The work queues, in spec 03 AD-02 order: pending sellers (T-H7), unassigned shipments (T-H9), refunds to
 * record and orders awaiting card payment (T-H10), agents holding COD cash (T-H11). Each task appends its
 * queue component here.
 */
export const DASHBOARD_QUEUES: readonly ComponentType[] = [];

/** AD-02 Dashboard: a grid of work-queue cards, each polled every 60 s while visible. */
export function Dashboard({ queues = DASHBOARD_QUEUES }: { readonly queues?: readonly ComponentType[] }) {
  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      {queues.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input p-6 text-muted-foreground">
          {COPY.noQueuesYet}
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {queues.map((Queue, index) => (
            // The list is static (module constant), so the index is a stable key.
            <Queue key={index} />
          ))}
        </div>
      )}
    </div>
  );
}
