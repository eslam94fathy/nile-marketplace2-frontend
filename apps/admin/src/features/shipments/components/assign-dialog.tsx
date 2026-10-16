'use client';

import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  ErrorState,
  FormAlert,
  LoadMore,
  Skeleton,
  toast,
} from '@nile/ui';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { agentKeys, assignableAgentsOptions, useGovernorateName, type AdminAgent } from '@/features/lookups';
import { assignShipment, shipmentKeys, type AdminShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import { assignCandidates } from '../lib/assign';

export interface AssignDialogProps {
  readonly shipment: AdminShipment;
  readonly onClose: () => void;
}

/**
 * AD-13 Assign / Reassign: active agents only, the current one left out, those based in the pickup
 * governorate and on shift first; one button per agent sends `POST …/assign`.
 */
export function AssignDialog({ shipment, onClose }: AssignDialogProps) {
  const queryClient = useQueryClient();
  const failure = useSubmitFailure({
    AGENT_INACTIVE: COPY.agentUnavailable,
    AGENT_NOT_FOUND: COPY.agentUnavailable,
    SHIPMENT_ALREADY_ASSIGNED_TO_AGENT: COPY.alreadyAssigned,
  });
  const governorates = useGovernorateName();
  const agents = useInfiniteQuery(assignableAgentsOptions());
  const [sending, setSending] = useState<string | null>(null);
  const candidates = assignCandidates(agents.data?.pages.flatMap((page) => page.data) ?? [], shipment);

  const refreshShipment = () => queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipment.id) });

  const assign = async (agent: AdminAgent) => {
    failure.clear();
    setSending(agent.id);
    try {
      const updated = await assignShipment(shipment.id, agent.id);
      queryClient.setQueryData(shipmentKeys.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: shipmentKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: shipmentKeys.dashboard() });
      void queryClient.invalidateQueries({ queryKey: agentKeys.all() });
      toast({ title: COPY.assigned(agent.fullName), tone: 'success' });
      onClose();
    } catch (error) {
      if (isApiError(error, 'SHIPMENT_NOT_ASSIGNABLE')) {
        void refreshShipment();
        toast({ title: COPY.notAssignable, tone: 'destructive' });
        onClose();
        return;
      }
      if (isApiError(error, 'AGENT_INACTIVE') || isApiError(error, 'AGENT_NOT_FOUND')) {
        void agents.refetch();
        failure.fail(error);
        return;
      }
      if (isApiError(error, 'SHIPMENT_ALREADY_ASSIGNED_TO_AGENT')) void refreshShipment();
      failure.fail(error);
    } finally {
      setSending(null);
    }
  };

  let body;
  if (agents.isError) {
    body = <ErrorState message={COPY.agentsFailed} onRetry={() => void agents.refetch()} />;
  } else if (agents.data === undefined) {
    body = <Skeleton className="h-32" />;
  } else if (candidates.length === 0) {
    body = <p className="text-sm text-muted-foreground">{COPY.noAgents}</p>;
  } else {
    body = (
      <ul aria-label={COPY.agentsCaption} className="divide-y divide-border">
        {candidates.map((agent) => (
          <li key={agent.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <span className="space-y-1 text-sm">
              <span className="block font-medium">{agent.fullName}</span>
              <span className="flex flex-wrap items-center gap-2 text-muted-foreground">
                <span>{COPY.basedIn(governorates.name(agent.homeGovernorateId))}</span>
                <Badge tone={agent.onShift ? 'success' : 'neutral'}>
                  {agent.onShift ? COPY.onShift : COPY.offShift}
                </Badge>
                <span>{COPY.activeCount(agent.activeShipmentCount)}</span>
              </span>
            </span>
            <Button
              size="sm"
              aria-label={COPY.assignTo(agent.fullName)}
              loading={sending === agent.id}
              disabled={sending !== null && sending !== agent.id}
              onClick={() => void assign(agent)}
            >
              {COPY.assign}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && sending === null) onClose();
      }}
    >
      <DialogContent title={COPY.assignTitle(shipment.orderNumber)} description={COPY.assignNote}>
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        {body}
        <LoadMore
          hasMore={agents.hasNextPage}
          loading={agents.isFetchingNextPage}
          onLoadMore={() => void agents.fetchNextPage()}
          loadedCount={candidates.length}
          label={COPY.moreAgents}
        />
      </DialogContent>
    </Dialog>
  );
}
