'use client';

import { PageHeader } from '@nile/ui';
import { DELIVERY_COPY as COPY } from '../copy';
import { AgentShare } from './agent-share';
import { GovernoratesTable } from './governorates-table';

/** AD-08 Governorates and agent share. */
export function DeliverySettingsView() {
  return (
    <div className="space-y-8">
      <PageHeader title={COPY.title} />
      <AgentShare />
      <GovernoratesTable />
    </div>
  );
}
