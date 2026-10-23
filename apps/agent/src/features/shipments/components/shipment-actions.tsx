'use client';

import { agentShipmentActions, type AgentShipmentAction } from '@nile/domain';
import { errorMessage, useIdempotentMutation } from '@nile/query';
import { Button, ConfirmDialog, toast } from '@nile/ui';
import { useState } from 'react';
import { markPickedUp, markReturned, startDelivery, type AgentShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import { useShipmentUpdates } from '../hooks';
import { DeliveredSheet } from './delivered-sheet';
import { FailedAttemptSheet } from './failed-attempt-sheet';

const LABELS: Readonly<Record<AgentShipmentAction, string>> = {
  picked_up: COPY.pickedUpAction,
  start_delivery: COPY.startDelivery,
  start_next_attempt: COPY.startNextAttempt,
  delivered: COPY.deliveredAction,
  delivery_failed: COPY.failedAction,
  handed_back: COPY.handBack,
};

export interface ShipmentActionsProps {
  readonly shipment: AgentShipment;
  readonly onDelivered: () => void;
}

/**
 * AG-05 actions in a bar fixed above the bottom navigation (spec 04 §2.1): exactly one primary action per
 * status, plus "Delivery failed" while out for delivery (`agentShipmentActions`, display only; the backend
 * still decides).
 */
export function ShipmentActions({ shipment, onDelivered }: ShipmentActionsProps) {
  const [open, setOpen] = useState<AgentShipmentAction | null>(null);
  const [starting, setStarting] = useState(false);
  const { settle, handleStale } = useShipmentUpdates(shipment.id);
  const returned = useIdempotentMutation({ mutationFn: markReturned });
  const { primary, secondary } = agentShipmentActions(shipment);
  if (primary === null && secondary === null) return null;
  const close = () => {
    setOpen(null);
  };

  /** A2: no confirmation; the payment card then shows the final amount. */
  const start = async () => {
    setStarting(true);
    try {
      settle(await startDelivery(shipment.id));
      toast({ title: COPY.started });
    } catch (error) {
      if (!handleStale(error)) toast({ title: errorMessage(error), tone: 'destructive' });
    } finally {
      setStarting(false);
    }
  };

  const pickedUp = async () => {
    try {
      settle(await markPickedUp(shipment.id));
      toast({ title: COPY.pickedUpDone, tone: 'success' });
    } catch (error) {
      if (handleStale(error)) return;
      toast({ title: errorMessage(error), tone: 'destructive' });
      throw error;
    }
  };

  const handedBack = async () => {
    try {
      settle(await returned.mutateAsync(shipment.id));
      toast({ title: COPY.handBackDone, tone: 'success' });
    } catch (error) {
      // Refused: this was a normal return after all (AG-Q-1), which the seller confirms.
      if (handleStale(error, COPY.returnNote(shipment.pickup.businessName))) return;
      toast({ title: errorMessage(error), tone: 'destructive' });
      throw error;
    }
  };

  const press = (action: AgentShipmentAction) => {
    if (action === 'start_delivery' || action === 'start_next_attempt') void start();
    else setOpen(action);
  };

  return (
    <>
      <div
        role="group"
        aria-label={COPY.actionsLabel}
        className="fixed inset-x-0 bottom-14 z-30 border-t border-border bg-background p-3"
      >
        <div className="mx-auto flex max-w-md gap-3">
          {secondary === null ? null : (
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => {
                press(secondary);
              }}
            >
              {LABELS[secondary]}
            </Button>
          )}
          {primary === null ? null : (
            <Button
              size="lg"
              className="flex-1"
              loading={starting}
              onClick={() => {
                press(primary);
              }}
            >
              {LABELS[primary]}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={open === 'picked_up'}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title={COPY.pickedUpTitle}
        description={COPY.pickedUpConfirm(shipment.pickup.businessName)}
        confirmLabel={COPY.pickedUpAction}
        onConfirm={pickedUp}
      />
      <ConfirmDialog
        open={open === 'handed_back'}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        title={COPY.handBackTitle}
        description={COPY.handBackConfirm(shipment.pickup.businessName)}
        confirmLabel={COPY.handBack}
        onConfirm={handedBack}
      />
      {open === 'delivered' ? (
        <DeliveredSheet
          shipment={shipment}
          onClose={close}
          onDelivered={() => {
            close();
            onDelivered();
          }}
        />
      ) : null}
      {open === 'delivery_failed' ? <FailedAttemptSheet shipment={shipment} onClose={close} /> : null}
    </>
  );
}
