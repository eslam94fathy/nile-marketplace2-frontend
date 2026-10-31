'use client';

import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { formatMoney } from '@nile/domain';
import { useIdempotentMutation } from '@nile/query';
import { Button, Checkbox, Dialog, DialogClose, DialogContent, FormAlert, Label, UI_COPY } from '@nile/ui';
import { useId, useState } from 'react';
import { markDelivered, type AgentShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import { useShipmentUpdates } from '../hooks';

export interface DeliveredSheetProps {
  readonly shipment: AgentShipment;
  readonly onDelivered: () => void;
  readonly onClose: () => void;
}

/**
 * A3 Delivered (AG-Q-2): COD shows the API's `amountToCollect` and the agent ticks "I collected {amount}";
 * that amount is sent, never typed. Card: a confirmation, no amount sent. One `Idempotency-Key` per intent:
 * a retry of the same amount reuses it; a changed amount is a new intent.
 */
export function DeliveredSheet({ shipment, onDelivered, onClose }: DeliveredSheetProps) {
  const id = useId();
  const failure = useSubmitFailure();
  const { settle, refetch, handleStale } = useShipmentUpdates(shipment.id);
  const mutation = useIdempotentMutation({
    mutationFn: markDelivered,
    intentScope: ['agent', 'delivered', shipment.id],
  });
  const [collected, setCollected] = useState(false);
  const [showRequired, setShowRequired] = useState(false);
  const [amountChanged, setAmountChanged] = useState(false);
  const cod = shipment.paymentMethod === 'cod';
  const amount = formatMoney(shipment.amountToCollect);

  const confirm = async () => {
    failure.clear();
    setAmountChanged(false);
    if (cod && !collected) {
      setShowRequired(true);
      return;
    }
    try {
      settle(
        await mutation.mutateAsync({
          shipmentId: shipment.id,
          codCollectedAmount: cod ? shipment.amountToCollect : null,
        }),
      );
      onDelivered();
    } catch (error) {
      if (isApiError(error, 'COD_AMOUNT_MISMATCH') || isApiError(error, 'COD_AMOUNT_REQUIRED')) {
        // The amount moved (e.g. the delivery fee was added): read it again, show it, ask to tick again.
        await refetch();
        setCollected(false);
        setAmountChanged(true);
        return;
      }
      if (handleStale(error)) {
        onClose();
        return;
      }
      failure.fail(error);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent
        placement="bottom"
        title={COPY.deliveredTitle}
        description={cod ? COPY.collectSheet(amount) : COPY.cardDeliver(shipment.dropoff.recipientName)}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="outline" size="lg" disabled={mutation.isPending}>
                {UI_COPY.cancel}
              </Button>
            </DialogClose>
            <Button size="lg" loading={mutation.isPending} onClick={() => void confirm()}>
              {COPY.confirmDelivered}
            </Button>
          </>
        }
      >
        {amountChanged ? <FormAlert>{COPY.amountChanged(amount)}</FormAlert> : null}
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        {cod ? (
          <div className="space-y-2">
            <p className="text-3xl font-bold tabular-nums">{amount}</p>
            <div className="flex min-h-12 items-center gap-3">
              <Checkbox
                id={`${id}-collected`}
                checked={collected}
                aria-invalid={showRequired && !collected ? true : undefined}
                aria-describedby={showRequired && !collected ? `${id}-required` : undefined}
                onCheckedChange={(next) => {
                  setCollected(next === true);
                }}
                className="size-6"
              />
              <Label htmlFor={`${id}-collected`} className="text-base">
                {COPY.collectedCheck(amount)}
              </Label>
            </div>
            {showRequired && !collected ? (
              <p id={`${id}-required`} className="text-sm text-destructive">
                {COPY.collectedRequired}
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
