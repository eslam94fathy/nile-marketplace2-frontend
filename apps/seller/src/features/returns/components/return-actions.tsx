'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { fields, formatDateTime } from '@nile/domain';
import { MEDIA_ACCEPT, useImageUploads, type UploadTile } from '@nile/media';
import { useIdempotentMutation } from '@nile/query';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  FormAlert,
  Label,
  Textarea,
  toast,
  UI_COPY,
  UploadTiles,
  useCooldown,
  usePassed,
  type UploadTileView,
} from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { financeKeys } from '@/features/finance';
import { orderKeys } from '@/features/orders';
import { productKeys } from '@/features/products';
import { useNotApprovedHandler, useSellerAccess } from '@/features/profile';
import { browserApi } from '@/lib/browser-api';
import {
  approveReturn,
  confirmReceipt,
  disputeReturn,
  rejectReturn,
  returnKeys,
  type SellerReturn,
} from '../api';
import { RETURNS_COPY as COPY } from '../copy';

/** Reject and dispute reasons: 3..500 characters, trimmed (`RejectReturnDto`, `DisputeReturnDto`). */
const REASON_MIN = 3;
const REASON_MAX = 500;
/** Photos with a dispute [SPEC 18 §4]. */
const DISPUTE_MAX_PHOTOS = 4;

const reasonSchema = z.object({ reason: fields.trimmedString(REASON_MIN, REASON_MAX) });
type ReasonValues = z.input<typeof reasonSchema>;

const atMs = (iso: string | null) => (iso === null ? Number.NaN : Date.parse(iso));

/** Each answer is the whole return: it replaces the cache; lists, the order and the overview follow. */
function useReturnUpdates(item: SellerReturn) {
  const queryClient = useQueryClient();
  const handleNotApproved = useNotApprovedHandler();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: returnKeys.detail(item.id) });
  };
  const settle = (updated: SellerReturn, extra: readonly (readonly unknown[])[] = []) => {
    queryClient.setQueryData(returnKeys.detail(updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: returnKeys.lists() });
    void queryClient.invalidateQueries({ queryKey: returnKeys.overview('toDecide') });
    void queryClient.invalidateQueries({ queryKey: returnKeys.overview('toCheck') });
    void queryClient.invalidateQueries({ queryKey: orderKeys.detail(updated.sellerOrderId) });
    for (const queryKey of extra) void queryClient.invalidateQueries({ queryKey });
  };
  /** Failures every action shares; true when handled (the return is read again and the reason toasted). */
  const handleShared = (error: unknown): boolean => {
    if (handleNotApproved(error)) return true;
    for (const code of ['RETURN_INVALID_STATUS_TRANSITION', 'RETURN_INSPECTION_WINDOW_CLOSED'] as const) {
      if (isApiError(error, code)) {
        refresh();
        toast({ title: COPY.errors[code], tone: 'destructive' });
        return true;
      }
    }
    if (isApiError(error, 'RETURN_NOT_FOUND')) {
      refresh();
      return true;
    }
    return false;
  };
  return { settle, refresh, handleShared };
}

type Dialog = 'approve' | 'reject' | 'confirm' | 'dispute' | null;

/**
 * SE-19 actions: Approve / Reject while `requested` and before the decision deadline; Confirm receipt /
 * Report a problem while `received` and before the inspection deadline. Allowed for approved and suspended
 * sellers (open orders continue [SPEC 18 UC-RE-2]).
 */
export function ReturnActions({ item }: { readonly item: SellerReturn }) {
  const access = useSellerAccess();
  const reasonId = useId();
  const [open, setOpen] = useState<Dialog>(null);
  const decisionClosed = usePassed(atMs(item.sellerDecisionDeadlineAt));
  const inspectionClosed = usePassed(atMs(item.inspectionDeadlineAt));
  const deciding = item.status === 'requested' && !decisionClosed;
  const checking = item.status === 'received' && !inspectionClosed;
  if (!deciding && !checking) return null;

  const describedBy = access.orders || access.reason === null ? undefined : reasonId;
  const openWith = (dialog: Exclude<Dialog, null>) => () => {
    setOpen(dialog);
  };
  const onOpenChange = (next: boolean) => {
    if (!next) setOpen(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {deciding ? (
          <>
            <Button disabled={!access.orders} aria-describedby={describedBy} onClick={openWith('approve')}>
              {COPY.approve}
            </Button>
            <Button
              variant="outline"
              disabled={!access.orders}
              aria-describedby={describedBy}
              onClick={openWith('reject')}
            >
              {COPY.reject}
            </Button>
          </>
        ) : (
          <>
            <Button disabled={!access.orders} aria-describedby={describedBy} onClick={openWith('confirm')}>
              {COPY.confirmReceipt}
            </Button>
            <Button
              variant="outline"
              disabled={!access.orders}
              aria-describedby={describedBy}
              onClick={openWith('dispute')}
            >
              {COPY.dispute}
            </Button>
          </>
        )}
      </div>
      {describedBy === undefined ? null : (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {access.reason}
        </p>
      )}
      <ApproveDialog item={item} open={open === 'approve'} onOpenChange={onOpenChange} />
      <RejectDialog item={item} open={open === 'reject'} onOpenChange={onOpenChange} />
      {/* A new key per opening: the choices start again from the return's current items. */}
      {open === 'confirm' ? <ConfirmReceiptDialog item={item} onOpenChange={onOpenChange} /> : null}
      {open === 'dispute' ? <DisputeDialog item={item} onOpenChange={onOpenChange} /> : null}
    </div>
  );
}

interface DialogProps {
  readonly item: SellerReturn;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

function ApproveDialog({ item, open, onOpenChange }: DialogProps) {
  const { settle, handleShared } = useReturnUpdates(item);
  const failure = useSubmitFailure();
  const approve = async () => {
    failure.clear();
    try {
      settle(await approveReturn(item.id));
      toast({ title: COPY.approved, tone: 'success' });
    } catch (error) {
      if (handleShared(error)) return;
      failure.fail(error);
      throw error;
    }
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) failure.clear();
        onOpenChange(next);
      }}
      title={COPY.approveTitle}
      description={COPY.approveConfirm}
      confirmLabel={COPY.approve}
      onConfirm={approve}
    >
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
    </ConfirmDialog>
  );
}

/** Validates the reason form; resolves to the parsed reason, or throws so the dialog stays open. */
async function parsedReason(form: ReturnType<typeof useReasonForm>): Promise<string> {
  let reason: string | undefined;
  await form.handleSubmit((values) => {
    reason = values.reason;
  })();
  if (reason === undefined) throw new Error('invalid');
  return reason;
}

function useReasonForm() {
  return useForm<ReasonValues, unknown, z.output<typeof reasonSchema>>({
    resolver: zodResolver(reasonSchema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });
}

function RejectDialog({ item, open, onOpenChange }: DialogProps) {
  const { settle, handleShared } = useReturnUpdates(item);
  const failure = useSubmitFailure();
  const form = useReasonForm();
  const close = (next: boolean) => {
    if (!next) {
      failure.clear();
      form.reset();
    }
    onOpenChange(next);
  };
  const reject = async () => {
    failure.clear();
    const reason = await parsedReason(form);
    try {
      settle(await rejectReturn(item.id, reason));
      toast({ title: COPY.rejected });
      form.reset();
    } catch (error) {
      if (handleShared(error)) {
        close(false);
        return;
      }
      failure.fail(error);
      throw error;
    }
  };
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={close}
      title={COPY.rejectTitle}
      description={COPY.rejectNote}
      confirmLabel={COPY.reject}
      cancelLabel={COPY.cancel}
      destructive
      onConfirm={reject}
    >
      <ReasonForm form={form} label={COPY.rejectReason} failure={failure} />
    </ConfirmDialog>
  );
}

function ReasonForm({
  form,
  label,
  failure,
}: {
  readonly form: ReturnType<typeof useReasonForm>;
  readonly label: string;
  readonly failure: ReturnType<typeof useSubmitFailure>;
}) {
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        // Enter must not submit: the dialog's button confirms.
        event.preventDefault();
      }}
    >
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <Field
        control={form.control}
        name="reason"
        label={label}
        required
        render={({ field, controlProps }) => (
          <Textarea {...field} {...controlProps} rows={3} maxLength={REASON_MAX} />
        )}
      />
    </form>
  );
}

/**
 * "Put back in stock" for every item, on by default (SE-Q-12); the body carries every item exactly once.
 * Idempotent with one key per set of choices; `RETURN_ITEMS_MISMATCH` reads the return again and the dialog
 * shows its current items.
 */
function ConfirmReceiptDialog({
  item,
  onOpenChange,
}: {
  readonly item: SellerReturn;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { settle, refresh, handleShared } = useReturnUpdates(item);
  const failure = useSubmitFailure();
  const mutation = useIdempotentMutation({
    mutationFn: confirmReceipt,
    intentScope: ['seller', 'confirm-receipt', item.id],
  });
  const [restock, setRestock] = useState<Readonly<Record<string, boolean>>>({});
  const [mismatch, setMismatch] = useState(false);
  const chosen = (returnItemId: string) => restock[returnItemId] ?? true;

  const confirm = async () => {
    failure.clear();
    setMismatch(false);
    const body = {
      items: item.items.map((line) => ({ returnItemId: line.id, restock: chosen(line.id) })),
    };
    try {
      settle(await mutation.mutateAsync({ returnId: item.id, body }), [
        financeKeys.balance(),
        financeKeys.holds(),
        financeKeys.entries(),
        productKeys.all(),
      ]);
      toast({ title: COPY.confirmed, tone: 'success' });
    } catch (error) {
      if (isApiError(error, 'RETURN_ITEMS_MISMATCH')) {
        refresh();
        setMismatch(true);
        throw error;
      }
      if (handleShared(error)) return;
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={COPY.confirmReceiptTitle}
      description={COPY.confirmReceiptNote(
        item.inspectionDeadlineAt === null ? '' : formatDateTime(item.inspectionDeadlineAt),
      )}
      confirmLabel={COPY.confirmReceipt}
      cancelLabel={COPY.cancel}
      onConfirm={confirm}
    >
      {mismatch ? <FormAlert>{COPY.errors.RETURN_ITEMS_MISMATCH}</FormAlert> : null}
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}
      <ul className="space-y-3">
        {item.items.map((line) => (
          <RestockChoice
            key={line.id}
            id={line.id}
            product={line.productName}
            quantity={line.quantity}
            checked={chosen(line.id)}
            onChange={(checked) => {
              setRestock((current) => ({ ...current, [line.id]: checked }));
            }}
          />
        ))}
      </ul>
    </ConfirmDialog>
  );
}

function RestockChoice({
  id,
  product,
  quantity,
  checked,
  onChange,
}: {
  readonly id: string;
  readonly product: string;
  readonly quantity: number;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const inputId = useId();
  return (
    <li key={id} className="flex items-start gap-3 text-sm">
      <Checkbox
        id={inputId}
        checked={checked}
        aria-label={COPY.restockItem(product)}
        onCheckedChange={(value) => {
          onChange(value === true);
        }}
      />
      <Label htmlFor={inputId} className="space-y-0.5 font-normal">
        <span className="block font-medium">{product}</span>
        <span className="block text-muted-foreground">
          {COPY.quantity(quantity)} · {COPY.restock}
        </span>
      </Label>
    </li>
  );
}

function tileView(tile: UploadTile): UploadTileView {
  return {
    key: tile.key,
    fileName: tile.fileName,
    previewUrl: tile.previewUrl,
    status: tile.status,
    progress: tile.progress,
    message: tile.message,
    canRetry: tile.canRetry,
  };
}

/** Report a problem: reason 3..500 and up to 4 photos (`return_photo`); sending waits for the uploads. */
function DisputeDialog({
  item,
  onOpenChange,
}: {
  readonly item: SellerReturn;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const { settle, handleShared } = useReturnUpdates(item);
  const failure = useSubmitFailure();
  const form = useReasonForm();
  const cooldown = useCooldown();
  const uploads = useImageUploads({
    api: browserApi,
    purpose: 'return_photo',
    max: DISPUTE_MAX_PHOTOS,
    onRateLimited: cooldown.start,
  });

  const send = async () => {
    failure.clear();
    const reason = await parsedReason(form);
    // Uploads still running: the dialog stays open with the waiting note (conventions §12.2).
    if (uploads.busy) throw new Error('uploading');
    const photoMediaIds = uploads.readyMediaIds;
    try {
      settle(
        await disputeReturn(item.id, {
          reason,
          ...(photoMediaIds.length === 0 ? {} : { photoMediaIds: [...photoMediaIds] }),
        }),
      );
      toast({ title: COPY.disputed });
      uploads.clear();
    } catch (error) {
      if (isApiError(error, 'MEDIA_NOT_ATTACHABLE')) {
        uploads.markNotAttachable(
          error.details.flatMap((detail) => (detail.value === undefined ? [] : [detail.value])),
        );
        throw error;
      }
      if (handleShared(error)) {
        onOpenChange(false);
        return;
      }
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={onOpenChange}
      title={COPY.disputeTitle}
      description={COPY.disputeNote}
      confirmLabel={COPY.send}
      cancelLabel={COPY.cancel}
      onConfirm={send}
    >
      <ReasonForm form={form} label={COPY.disputeReason} failure={failure} />
      <UploadTiles
        tiles={uploads.tiles.map(tileView)}
        refusals={uploads.refusals}
        announcement={uploads.announcement}
        accept={MEDIA_ACCEPT}
        canAddMore={uploads.canAddMore}
        onAdd={uploads.add}
        onRemove={uploads.remove}
        onRetry={uploads.retry}
        cooldownSeconds={cooldown.remaining}
        label={COPY.disputePhotos}
        className="mt-3"
      />
      {uploads.busy ? <p className="text-sm text-muted-foreground">{UI_COPY.waitForUploads}</p> : null}
    </ConfirmDialog>
  );
}
