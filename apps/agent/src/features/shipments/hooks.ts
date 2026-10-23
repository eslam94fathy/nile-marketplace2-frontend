'use client';

import { isApiError } from '@nile/api';
import { toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { profileKeys, useInactiveHandler } from '@/features/profile';
import { shipmentKeys, type AgentShipment } from './api';
import { SHIPMENTS_COPY as COPY } from './copy';

/**
 * Every action answers with the shipment: it replaces AG-05's cache; the lists and the profile's active count
 * follow (design 02 §3.4). Finance is booked later by the backend worker and is read on its next visit.
 */
export function useShipmentUpdates(shipmentId: string) {
  const queryClient = useQueryClient();
  const handleInactive = useInactiveHandler();

  const settle = (shipment: AgentShipment) => {
    queryClient.setQueryData(shipmentKeys.detail(shipment.id), shipment);
    void queryClient.invalidateQueries({ queryKey: shipmentKeys.active() });
    void queryClient.invalidateQueries({ queryKey: shipmentKeys.history() });
    void queryClient.invalidateQueries({ queryKey: profileKeys.profile() });
  };

  const refetch = () => queryClient.invalidateQueries({ queryKey: shipmentKeys.detail(shipmentId) });

  /**
   * The shipment moved on, or isn't the agent's any more, or the agent is inactive: read it again (the screen
   * follows) and say so. True when handled.
   */
  const handleStale = (error: unknown, message: string = COPY.changed): boolean => {
    if (handleInactive(error)) return true;
    if (isApiError(error, 'SHIPMENT_INVALID_STATUS_TRANSITION') || isApiError(error, 'SHIPMENT_NOT_FOUND')) {
      void refetch();
      toast({ title: message, tone: 'destructive' });
      return true;
    }
    return false;
  };

  return { settle, refetch, handleStale };
}
