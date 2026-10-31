'use client';

import { isApiError } from '@nile/api';
import {
  defaultErrorMessage,
  fields,
  formatDate,
  formatDateTime,
  formatMoney,
  RETURN_REASON_LABELS,
  RETURN_REFUND_STATUS_LABELS,
  RETURN_REFUSAL_REASON_LABELS,
  RETURN_STATUS_LABELS,
} from '@nile/domain';
import {
  Button,
  buttonVariants,
  ConfirmDialog,
  Countdown,
  Dialog,
  DialogContent,
  ErrorState,
  FormAlert,
  Label,
  LoadingRegion,
  Money,
  NileImage,
  NotFoundScreen,
  PageHeader,
  PrivateImage,
  RETURN_REFUND_STATUS_TONES,
  RETURN_STATUS_TONES,
  Skeleton,
  StatusBadge,
  Textarea,
  toast,
  usePassed,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useId, useState, type ReactNode, type SyntheticEvent } from 'react';
import { orderPath, ROUTES } from '@/lib/routes';
import { cancelReturn, escalateReturn, returnKeys, returnQuery, type Return } from '../api';
import { RETURN_NEXT_STEP, RETURNS_COPY as COPY } from '../copy';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTE_MIN = 3;
const NOTE_MAX = 500;

/** The deadline that matters in each waiting state (spec 01 §10.6, conventions §12.10). */
function deadlineOf(data: Return): string | null {
  switch (data.status) {
    case 'requested':
      return data.sellerDecisionDeadlineAt;
    case 'rejected':
      return data.escalationDeadlineAt;
    case 'received':
      return data.inspectionDeadlineAt;
    default:
      return null;
  }
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function NextStep({ data, onDeadline }: { readonly data: Return; readonly onDeadline: () => void }) {
  const deadline = deadlineOf(data);
  // Under 24 h the deadline also counts down (conventions §12.10).
  const soon = usePassed(deadline === null ? Number.NaN : Date.parse(deadline) - DAY_MS);
  const final = data.status === 'completed';
  const sentence =
    data.status === 'refused'
      ? data.refusalReason === null
        ? null
        : RETURN_REFUSAL_REASON_LABELS.customer[data.refusalReason]
      : RETURN_NEXT_STEP[data.status](
          deadline === null ? null : formatDateTime(deadline),
          final ? formatMoney(data.refund?.amount ?? data.refundAmount) : undefined,
        );
  if (sentence === null) return null;
  return (
    <Section title={COPY.nextHeading}>
      <p>{sentence}</p>
      {soon && deadline !== null ? (
        <p className="text-sm">
          {COPY.deadline}: <Countdown deadline={deadline} label={COPY.deadline} onExpire={onDeadline} />
        </p>
      ) : null}
    </Section>
  );
}

function CancelAction({ data, onChanged }: { readonly data: Return; readonly onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = async () => {
    setProblem(null);
    try {
      await cancelReturn(data.id);
      toast({ title: COPY.cancel.done, tone: 'success' });
      onChanged();
    } catch (error) {
      onChanged();
      setProblem(
        isApiError(error, 'RETURN_INVALID_STATUS_TRANSITION')
          ? COPY.cancel.alreadyCollected
          : defaultErrorMessage(isApiError(error) ? error.code : 'NETWORK_ERROR'),
      );
    }
  };
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        {COPY.cancel.action}
      </Button>
      {problem === null ? null : <FormAlert>{problem}</FormAlert>}
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={COPY.cancel.title}
        description={COPY.cancel.description}
        confirmLabel={COPY.cancel.confirm}
        cancelLabel={COPY.cancel.keep}
        destructive
        onConfirm={confirm}
      />
    </>
  );
}

function EscalateAction({ data, onChanged }: { readonly data: Return; readonly onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const noteId = useId();
  const errorId = useId();

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = note.trim();
    if (text.length < NOTE_MIN || text.length > NOTE_MAX) {
      setInvalid(
        text.length < NOTE_MIN
          ? fields.FIELD_MESSAGES.tooShort(NOTE_MIN)
          : fields.FIELD_MESSAGES.tooLong(NOTE_MAX),
      );
      return;
    }
    setInvalid(null);
    setPending(true);
    try {
      await escalateReturn(data.id, text);
      toast({ title: COPY.escalate.done, tone: 'success' });
      setOpen(false);
      onChanged();
    } catch (error) {
      if (isApiError(error, 'RETURN_ESCALATION_WINDOW_CLOSED')) {
        setOpen(false);
        setProblem(COPY.escalate.windowClosed);
        onChanged();
      } else {
        setInvalid(defaultErrorMessage(isApiError(error) ? error.code : 'NETWORK_ERROR'));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        {COPY.escalate.action}
      </Button>
      {problem === null ? null : <FormAlert>{problem}</FormAlert>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={COPY.escalate.title}>
          <form noValidate onSubmit={(event) => void submit(event)} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={noteId}>{COPY.escalate.note}</Label>
              <Textarea
                id={noteId}
                rows={4}
                value={note}
                aria-required
                aria-invalid={invalid !== null}
                {...(invalid === null ? {} : { 'aria-describedby': errorId })}
                onChange={(event) => {
                  setNote(event.target.value);
                }}
              />
              {invalid === null ? null : (
                <p id={errorId} className="text-sm text-destructive">
                  {invalid}
                </p>
              )}
            </div>
            <Button type="submit" loading={pending}>
              {COPY.escalate.submit}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReturnBody({ data, onChanged }: { readonly data: Return; readonly onChanged: () => void }) {
  const final = data.status === 'completed';
  const canCancel = data.status === 'requested' || data.status === 'approved';
  const escalationClosed = usePassed(
    data.escalationDeadlineAt === null ? Number.NaN : Date.parse(data.escalationDeadlineAt),
  );
  const escalationOpen =
    data.status === 'rejected' && data.escalationDeadlineAt !== null && !escalationClosed;
  const refundAmount = data.refund?.amount ?? data.refundAmount;
  // Spec 01 SF-28 (rejected) and TK7-Q4 (pickup failed): support about this parcel (SF-30, category return).
  const offerSupport = data.status === 'rejected' || data.status === 'pickup_failed';

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.returnLabel(data.returnNumber)} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge value={data.status} labels={RETURN_STATUS_LABELS.customer} tones={RETURN_STATUS_TONES} />
        <Link href={orderPath(data.orderId)} className="text-primary underline-offset-4 hover:underline">
          {COPY.order(data.orderNumber)}
        </Link>
        <span className="text-muted-foreground">{COPY.requested(formatDate(data.createdAt))}</span>
      </div>

      <NextStep data={data} onDeadline={onChanged} />

      {canCancel || escalationOpen || offerSupport ? (
        <div className="flex flex-wrap items-start gap-3">
          {canCancel ? <CancelAction data={data} onChanged={onChanged} /> : null}
          {escalationOpen ? <EscalateAction data={data} onChanged={onChanged} /> : null}
          {offerSupport ? (
            <Link
              href={{
                pathname: ROUTES.supportNew,
                query: { category: 'return', order: data.orderId, sellerOrder: data.sellerOrderId },
              }}
              className={buttonVariants({ variant: 'outline' })}
            >
              {COPY.contactSupport}
            </Link>
          ) : null}
        </div>
      ) : null}

      {data.status === 'rejected' && data.rejectionReason !== null ? (
        <Section title={COPY.sellerReason}>
          {/* Plain text from the seller (CLAUDE.md §7). */}
          <p className="whitespace-pre-line">{data.rejectionReason}</p>
        </Section>
      ) : null}

      <Section title={COPY.itemsHeading}>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <NileImage
                image={item.image}
                alt=""
                sizes="64px"
                placeholder="product"
                className="size-16 shrink-0 rounded-md bg-muted"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{item.productName}</span>
                {item.attributes.length === 0 ? null : (
                  <span className="block text-muted-foreground">
                    {item.attributes.map((a) => `${a.attribute}: ${a.value}`).join(' · ')}
                  </span>
                )}
                <span className="block text-muted-foreground">{COPY.quantity(item.quantity)}</span>
              </span>
              <Money value={item.paidAmount} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title={COPY.reasonHeading}>
        <p>{RETURN_REASON_LABELS.customer[data.reason]}</p>
        {data.description === null ? null : <p className="whitespace-pre-line text-sm">{data.description}</p>}
      </Section>

      {data.photos.length === 0 ? null : (
        <Section title={COPY.photosHeading}>
          <ul className="flex flex-wrap gap-2">
            {data.photos.map((photo, index) => (
              <li key={photo.id}>
                {/* Private, expiring URLs (conventions §12.1): a failed load reads the return again once. */}
                <PrivateImage
                  image={photo}
                  alt={COPY.photoAlt(index + 1, data.photos.length)}
                  sizes="128px"
                  onExpired={onChanged}
                  className="size-32 rounded-md object-cover"
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={COPY.refundHeading}>
        <dl className="max-w-sm space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt>{COPY.returnFee}</dt>
            <dd className="text-end">
              <Money value={data.returnFee} />
              <span className="block text-muted-foreground">{COPY.feePaidBy[data.returnFeePayer]}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-4 font-semibold">
            <dt>{final || data.refund !== null ? COPY.refundAmount : COPY.estimatedRefund}</dt>
            <dd>
              <Money value={refundAmount} />
            </dd>
          </div>
        </dl>
        {data.refund === null ? null : (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <StatusBadge
              value={data.refund.status}
              labels={RETURN_REFUND_STATUS_LABELS}
              tones={RETURN_REFUND_STATUS_TONES}
            />
            {data.refund.refundedAt === null ? null : (
              <span className="text-muted-foreground">
                {COPY.refundedOn(formatDate(data.refund.refundedAt))}
              </span>
            )}
          </p>
        )}
      </Section>

      {data.timeline.length === 0 ? null : (
        <Section title={COPY.historyHeading}>
          <ol className="space-y-1 text-sm">
            {[...data.timeline]
              .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
              .map((entry) => (
                <li key={`${entry.status}-${entry.at}`} className="flex flex-wrap justify-between gap-2">
                  <span>{RETURN_STATUS_LABELS.customer[entry.status]}</span>
                  <time dateTime={entry.at} className="text-muted-foreground">
                    {formatDateTime(entry.at)}
                  </time>
                </li>
              ))}
          </ol>
        </Section>
      )}
    </div>
  );
}

/** SF-28 Return detail: `GET /returns/{id}`, live on `return.updated`; cancel and escalate (spec 01 SF-28). */
export function ReturnDetail({ returnId }: { readonly returnId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery(returnQuery(returnId));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: returnKeys.all() });
  };

  if (query.isPending) {
    return (
      <LoadingRegion className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </LoadingRegion>
    );
  }
  if (query.isError) {
    if (isApiError(query.error, 'RETURN_NOT_FOUND', 'VALIDATION_FAILED')) {
      return (
        <NotFoundScreen
          homeLink={
            <Link href={ROUTES.returns} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToReturns}
            </Link>
          }
        />
      );
    }
    return (
      <ErrorState
        message={COPY.detailLoadFailed}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        correlationId={isApiError(query.error) ? (query.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  return <ReturnBody data={query.data} onChanged={refresh} />;
}
