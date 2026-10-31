'use client';

// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import {
  ATTEMPT_FAILURE_REASON_LABELS,
  ATTEMPT_FAILURE_REASONS,
  fields,
  MAX_DELIVERY_ATTEMPTS,
  type AttemptFailureReason,
  type ShipmentKind,
} from '@nile/domain';
import { useIdempotentMutation } from '@nile/query';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  FormAlert,
  Label,
  Notice,
  Textarea,
  toast,
  UI_COPY,
} from '@nile/ui';
import { useId, useState } from 'react';
import { reportFailedAttempt, type AgentShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import { useShipmentUpdates } from '../hooks';

/** Note: optional, 1..500 trimmed, omitted when empty (`FailedAttemptDto`). */
const noteSchema = fields.nullableTrimmedString(1, 500);

/**
 * What happens after this attempt (spec 04 AG-05 A4 and §7.3 R2, SPEC 00 §4.7): stated before the agent submits.
 * A refusal or the third failure sends a delivery back to the seller and closes a return pickup.
 */
export function attemptConsequence(
  reason: AttemptFailureReason | null,
  attemptCount: number,
  kind: ShipmentKind = 'delivery',
): string | null {
  if (reason === null) return null;
  const isReturn = kind === 'return';
  if (reason === 'customer_refused')
    return isReturn ? COPY.pickupRefusedConsequence : COPY.refusedConsequence;
  const attempt = attemptCount + 1;
  if (attempt >= MAX_DELIVERY_ATTEMPTS)
    return isReturn ? COPY.pickupLastConsequence : COPY.lastAttemptConsequence;
  return COPY.retryConsequence(attempt, MAX_DELIVERY_ATTEMPTS);
}

export interface FailedAttemptSheetProps {
  readonly shipment: AgentShipment;
  readonly onClose: () => void;
}

/**
 * A4 Delivery failed, or R2 Pickup failed for a return pickup: reason (radio, required), optional note, the
 * consequence, one key per intent (the same endpoint for both kinds).
 */
export function FailedAttemptSheet({ shipment, onClose }: FailedAttemptSheetProps) {
  const id = useId();
  const failure = useSubmitFailure();
  const { settle, handleStale } = useShipmentUpdates(shipment.id);
  const mutation = useIdempotentMutation({ mutationFn: reportFailedAttempt });
  const [reason, setReason] = useState<AttemptFailureReason | null>(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; note?: string }>({});
  const isReturn = shipment.kind === 'return';
  const reasonLabels = isReturn ? ATTEMPT_FAILURE_REASON_LABELS.pickup : ATTEMPT_FAILURE_REASON_LABELS.agent;
  const consequence = attemptConsequence(reason, shipment.attemptCount, shipment.kind);

  const submit = async () => {
    failure.clear();
    const parsedNote = noteSchema.safeParse(note);
    const nextErrors = {
      ...(reason === null ? { reason: COPY.reasonRequired } : {}),
      ...(parsedNote.success ? {} : { note: parsedNote.error.issues[0]?.message ?? '' }),
    };
    setErrors(nextErrors);
    if (reason === null || !parsedNote.success) return;
    try {
      settle(
        await mutation.mutateAsync({
          shipmentId: shipment.id,
          body: { reason, ...(parsedNote.data === null ? {} : { note: parsedNote.data }) },
        }),
      );
      toast({ title: isReturn ? COPY.pickupFailedDone : COPY.failedDone });
      onClose();
    } catch (error) {
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
        title={isReturn ? COPY.pickupFailedTitle : COPY.failedTitle}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="outline" size="lg" disabled={mutation.isPending}>
                {UI_COPY.cancel}
              </Button>
            </DialogClose>
            <Button
              size="lg"
              variant="destructive"
              loading={mutation.isPending}
              onClick={() => void submit()}
            >
              {isReturn ? COPY.reportPickup : COPY.report}
            </Button>
          </>
        }
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <fieldset
          className="space-y-1"
          aria-describedby={errors.reason === undefined ? undefined : `${id}-reason-error`}
        >
          <legend className="mb-1 text-sm font-medium">
            {COPY.reason}
            <span className="sr-only"> {UI_COPY.required}</span>
          </legend>
          {ATTEMPT_FAILURE_REASONS.map((value) => (
            <label
              key={value}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
            >
              <input
                type="radio"
                name={`${id}-reason`}
                value={value}
                checked={reason === value}
                onChange={() => {
                  setReason(value);
                }}
                className="size-5 accent-primary"
              />
              <span className="text-base">{reasonLabels[value]}</span>
            </label>
          ))}
          {errors.reason === undefined ? null : (
            <p id={`${id}-reason-error`} className="text-sm text-destructive">
              {errors.reason}
            </p>
          )}
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor={`${id}-note`}>{COPY.note}</Label>
          <Textarea
            id={`${id}-note`}
            rows={2}
            value={note}
            aria-invalid={errors.note === undefined ? undefined : true}
            aria-describedby={errors.note === undefined ? undefined : `${id}-note-error`}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          {errors.note === undefined ? null : (
            <p id={`${id}-note-error`} className="text-sm text-destructive">
              {errors.note}
            </p>
          )}
        </div>
        {consequence === null ? null : <Notice>{consequence}</Notice>}
      </DialogContent>
    </Dialog>
  );
}
