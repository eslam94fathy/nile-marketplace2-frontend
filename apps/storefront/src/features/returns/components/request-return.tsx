'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which account pages don't have.
import { useHydrated, useSubmitFailure } from '@nile/auth-screens';
import {
  fields,
  formatDate,
  formatMoney,
  REFUND_PAYOUT_METHOD_LABELS,
  RETURN_REASON_LABELS,
} from '@nile/domain';
import { MEDIA_ACCEPT, useImageUploads, type UploadTile } from '@nile/media';
import { applyServerErrors, useIdempotentMutation } from '@nile/query';
import {
  Button,
  buttonVariants,
  EmptyState,
  ErrorState,
  Field,
  FormAlert,
  Input,
  LoadingRegion,
  Money,
  NileImage,
  PageHeader,
  PhoneInput,
  QuantityStepper,
  Skeleton,
  Textarea,
  toast,
  UI_COPY,
  UploadTiles,
  useCooldown,
  type UploadTileView,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { orderQuery, returnWindowEnd, type Order } from '@/features/orders';
import { browserApi } from '@/lib/browser-api';
import { orderPath, returnPath, ROUTES } from '@/lib/routes';
import { requestReturn, returnableItemsQuery, returnKeys, type ReturnableItems } from '../api';
import { REQUEST_RETURN_COPY as COPY } from '../copy';
import { customerPaysFee, estimateRefund, refundTooLow } from '../lib/estimate';
import {
  EMPTY_RETURN,
  hasItems,
  needsPhoto,
  requestBody,
  requestReturnSchema,
  RETURN_MAX_PHOTOS,
  RETURN_REASONS,
  type RequestReturnOutput,
  type RequestReturnValues,
} from '../schemas';

type SellerOrder = Order['sellerOrders'][number];
type PayoutField = 'walletNumber' | 'instapayAddress' | 'description';

const FIELD_MAP = {
  'refundPayout.walletNumber': { field: 'walletNumber', message: fields.FIELD_MESSAGES.egPhone },
  'refundPayout.instapayAddress': { field: 'instapayAddress', message: fields.FIELD_MESSAGES.tooLong(100) },
  description: { field: 'description', message: fields.FIELD_MESSAGES.tooLong(1000) },
} as const;

/** Read refusals of `returnable-items`, explained on the screen (spec 01 SF-26). */
function readRefusal(error: unknown, windowEnd: Date | null): string | null {
  if (isApiError(error, 'RETURN_WINDOW_CLOSED')) {
    return windowEnd === null
      ? COPY.windowClosedNoDate
      : COPY.windowClosed(formatDate(windowEnd.toISOString()));
  }
  if (isApiError(error, 'RETURN_NOT_ALLOWED')) return COPY.notAllowed;
  if (isApiError(error, 'RETURN_PICKUP_UNAVAILABLE')) return COPY.pickupUnavailable;
  return null;
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

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ChoiceRow({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  readonly name: string;
  readonly value: string;
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: () => void;
}) {
  const id = `${name}-${value}`;
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
    </div>
  );
}

function ErrorText({ id, message }: { readonly id: string; readonly message: string | undefined }) {
  return message === undefined ? null : (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

function ReturnForm({
  order,
  sellerOrder,
  returnable,
  onStale,
}: {
  readonly order: Order;
  readonly sellerOrder: SellerOrder;
  readonly returnable: ReturnableItems;
  readonly onStale: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hydrated = useHydrated();
  const failure = useSubmitFailure();
  const cooldown = useCooldown();
  const cod = order.paymentMethod === 'cod';
  const schema = requestReturnSchema(cod);
  const form = useForm<RequestReturnValues, unknown, RequestReturnOutput>({
    resolver: zodResolver(schema),
    // Every returnable item starts at 0 (none), so the steppers always hold a number.
    defaultValues: {
      ...EMPTY_RETURN,
      quantities: Object.fromEntries(returnable.items.map((line) => [line.orderItemId, 0])),
    },
  });
  const uploads = useImageUploads({
    api: browserApi,
    purpose: 'return_photo',
    max: RETURN_MAX_PHOTOS,
    onRateLimited: cooldown.start,
  });
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const reasonName = useId();
  const payoutName = useId();
  const quantitiesErrorId = useId();
  const reasonErrorId = useId();
  const payoutErrorId = useId();
  const watched = useWatch({ control: form.control }) as RequestReturnValues;
  const reason = watched.reason;
  const payoutMethod = watched.payoutMethod;
  const { errors } = form.formState;
  // A record field: its own message (the items check), not one per item.
  const [itemsError, setItemsError] = useState<string | null>(null);

  const place = useIdempotentMutation({
    mutationFn: requestReturn,
    intentScope: ['storefront', 'return', sellerOrder.id],
  });

  const itemsById = new Map(sellerOrder.items.map((item) => [item.id, item]));
  const lines = returnable.items
    .filter((line) => line.returnable > 0)
    .map((line) => ({ ...line, item: itemsById.get(line.orderItemId) }));
  const estimate = estimateRefund(
    lines.map((line) => ({
      paidUnitAmount: line.paidUnitAmount,
      quantity: watched.quantities[line.orderItemId] ?? 0,
    })),
    returnable.returnFee,
    reason,
  );

  const onSubmit = form.handleSubmit(async (values) => {
    failure.clear();
    setNotice(null);
    const itemsMissing = !hasItems(values.quantities);
    const photoMissing = needsPhoto(values.reason) && uploads.readyMediaIds.length === 0;
    setItemsError(itemsMissing ? COPY.chooseItems : null);
    setPhotoError(photoMissing ? COPY.photoRequired : null);
    if (itemsMissing || photoMissing) return;
    try {
      const created = await place.mutateAsync(
        requestBody(values, sellerOrder.id, uploads.readyMediaIds, cod),
      );
      uploads.clear();
      void queryClient.invalidateQueries({ queryKey: returnKeys.all() });
      toast({ title: COPY.requested(created.returnNumber), tone: 'success' });
      router.push(returnPath(created.id));
    } catch (error) {
      if (isApiError(error, 'MEDIA_NOT_ATTACHABLE')) {
        uploads.markNotAttachable(
          error.details.flatMap((detail) => (detail.value === undefined ? [] : [detail.value])),
        );
        return;
      }
      if (isApiError(error, 'RETURN_PHOTOS_REQUIRED')) {
        setPhotoError(COPY.photoRequired);
        return;
      }
      if (isApiError(error, 'RETURN_QUANTITY_INVALID')) {
        // The returnable quantities changed: read them again and say so at the items (spec 01 SF-26).
        place.resetIntent();
        setItemsError(COPY.quantityChanged);
        onStale();
        return;
      }
      if (isApiError(error, 'RETURN_ALREADY_OPEN')) {
        setNotice(
          <>
            {COPY.alreadyOpen}{' '}
            <Link href={{ pathname: ROUTES.returns, query: { status: 'open' } }} className="underline">
              {COPY.seeOpenReturns}
            </Link>
          </>,
        );
        return;
      }
      const refusal = isApiError(error, 'RETURN_AMOUNT_TOO_LOW')
        ? COPY.amountTooLow
        : readRefusal(error, null);
      if (refusal !== null) {
        setNotice(refusal);
        return;
      }
      if (!applyServerErrors<PayoutField>(error, form.setError, FIELD_MAP)) failure.fail(error);
    }
  });

  const views = uploads.tiles.map(tileView);
  const busy = uploads.busy || place.isPending;

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="max-w-2xl space-y-8">
      {notice === null ? null : <FormAlert>{notice}</FormAlert>}
      {failure.message === null ? null : (
        <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
      )}

      <Section title={COPY.itemsHeading}>
        <fieldset
          aria-describedby={itemsError === null ? undefined : quantitiesErrorId}
          aria-invalid={itemsError !== null}
          className="space-y-1"
        >
          <legend className="sr-only">{COPY.itemsHeading}</legend>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {lines.map((line) => (
              <li key={line.orderItemId} className="flex flex-wrap items-center gap-4 p-4">
                <NileImage
                  image={line.item?.image ?? null}
                  alt=""
                  sizes="64px"
                  placeholder="product"
                  className="size-16 shrink-0 rounded-md bg-muted"
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{line.item?.productName}</p>
                  {line.item === undefined || line.item.attributes.length === 0 ? null : (
                    <p className="text-muted-foreground">
                      {line.item.attributes.map((a) => `${a.attribute}: ${a.value}`).join(' · ')}
                    </p>
                  )}
                  <p>{COPY.paidEach(formatMoney(line.paidUnitAmount))}</p>
                </div>
                <Controller
                  control={form.control}
                  name={`quantities.${line.orderItemId}`}
                  render={({ field }) => (
                    <QuantityStepper
                      label={COPY.quantityLabel}
                      itemName={line.item?.productName ?? ''}
                      hideLabel
                      min={0}
                      max={line.returnable}
                      value={field.value}
                      onChange={(quantity) => {
                        field.onChange(quantity);
                        setItemsError(null);
                      }}
                    />
                  )}
                />
              </li>
            ))}
          </ul>
          <ErrorText id={quantitiesErrorId} message={itemsError ?? undefined} />
        </fieldset>
      </Section>

      <Section title={COPY.reasonHeading}>
        <fieldset
          aria-describedby={errors.reason === undefined ? undefined : reasonErrorId}
          aria-invalid={errors.reason !== undefined}
          className="space-y-2"
        >
          <legend className="sr-only">{COPY.reasonHeading}</legend>
          {RETURN_REASONS.map((value) => (
            <ChoiceRow
              key={value}
              name={reasonName}
              value={value}
              label={RETURN_REASON_LABELS.customer[value]}
              checked={reason === value}
              onChange={() => {
                form.setValue('reason', value, { shouldValidate: false });
                form.clearErrors('reason');
                setPhotoError(null);
              }}
            />
          ))}
          <ErrorText id={reasonErrorId} message={errors.reason?.message} />
          {reason === null ? null : (
            <p className="text-sm text-muted-foreground">
              {customerPaysFee(reason) ? COPY.feeNote(formatMoney(returnable.returnFee)) : COPY.freeNote}
            </p>
          )}
        </fieldset>
      </Section>

      <Section title={COPY.detailsHeading}>
        <Field
          control={form.control}
          name="description"
          label={COPY.description}
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={4} />}
        />
        <UploadTiles
          label={COPY.photos}
          tiles={views}
          refusals={uploads.refusals}
          announcement={uploads.announcement}
          accept={MEDIA_ACCEPT}
          canAddMore={uploads.canAddMore}
          cooldownSeconds={cooldown.remaining}
          onAdd={(files) => {
            setPhotoError(null);
            uploads.add(files);
          }}
          onRemove={uploads.remove}
          onRetry={uploads.retry}
        />
        {photoError === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {photoError}
          </p>
        )}
      </Section>

      <Section title={COPY.payoutHeading}>
        {cod ? (
          <fieldset
            aria-describedby={errors.payoutMethod === undefined ? undefined : payoutErrorId}
            aria-invalid={errors.payoutMethod !== undefined}
            className="space-y-3"
          >
            <legend className="sr-only">{COPY.payoutHeading}</legend>
            {(['mobile_wallet', 'instapay'] as const).map((value) => (
              <ChoiceRow
                key={value}
                name={payoutName}
                value={value}
                label={REFUND_PAYOUT_METHOD_LABELS[value]}
                checked={payoutMethod === value}
                onChange={() => {
                  form.setValue('payoutMethod', value);
                  form.clearErrors('payoutMethod');
                }}
              />
            ))}
            <ErrorText id={payoutErrorId} message={errors.payoutMethod?.message} />
            {payoutMethod === 'mobile_wallet' ? (
              <Field
                control={form.control}
                name="walletNumber"
                label={COPY.walletNumber}
                required
                render={({ field, controlProps }) => <PhoneInput {...field} {...controlProps} />}
              />
            ) : null}
            {payoutMethod === 'instapay' ? (
              <Field
                control={form.control}
                name="instapayAddress"
                label={COPY.instapayAddress}
                required
                render={({ field, controlProps }) => (
                  <Input {...field} {...controlProps} autoComplete="off" />
                )}
              />
            ) : null}
            <p className="text-sm text-muted-foreground">{COPY.payoutNote}</p>
          </fieldset>
        ) : (
          <p className="text-sm">{COPY.cardRefund}</p>
        )}
      </Section>

      <Section title={COPY.summaryHeading}>
        <dl className="max-w-sm space-y-2 text-sm">
          <div className="flex justify-between">
            <dt>{COPY.itemsValue}</dt>
            <dd>
              <Money value={estimate.itemsValue} />
            </dd>
          </div>
          {estimate.fee === null ? null : (
            <div className="flex justify-between">
              <dt>{COPY.returnFee}</dt>
              <dd>
                <Money value={estimate.fee} negative />
              </dd>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <dt>{COPY.estimatedRefund}</dt>
            <dd>
              <Money value={refundTooLow(estimate) ? '0.00' : estimate.refund} />
            </dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">{COPY.noDeliveryRefund}</p>
        <p className="text-sm text-muted-foreground">{COPY.pickupNote}</p>
      </Section>

      <div className="space-y-2">
        <Button type="submit" loading={place.isPending} disabled={!hydrated || busy || failure.blocked}>
          {COPY.submit}
        </Button>
        {uploads.busy ? <p className="text-sm text-muted-foreground">{UI_COPY.waitForUploads}</p> : null}
      </div>
    </form>
  );
}

function Loading() {
  return (
    <LoadingRegion className="space-y-4">
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
    </LoadingRegion>
  );
}

/**
 * SF-26 Request a return for one parcel: `GET /orders/{id}` and its `returnable-items`, then items, reason,
 * details and photos, refund payout (COD only) and the estimate (SF-Q-19); `POST /returns` with one key per body.
 */
export function RequestReturn({
  orderId,
  sellerOrderId,
}: {
  readonly orderId: string;
  readonly sellerOrderId: string | null;
}) {
  const order = useQuery(orderQuery(orderId));
  const returnable = useQuery({
    ...returnableItemsQuery(orderId, sellerOrderId ?? ''),
    enabled: sellerOrderId !== null,
  });
  const sellerOrder = order.data?.sellerOrders.find((candidate) => candidate.id === sellerOrderId);
  const back = (
    <Link href={orderPath(orderId)} className={buttonVariants({ variant: 'outline' })}>
      {COPY.backToOrder}
    </Link>
  );

  let body: ReactNode;
  if (sellerOrderId === null || isApiError(order.error, 'ORDER_NOT_FOUND', 'VALIDATION_FAILED')) {
    body = <EmptyState title={COPY.notAllowed} action={back} />;
  } else if (order.isPending || returnable.isPending) {
    body = <Loading />;
  } else if (order.isError || (returnable.isError && readRefusal(returnable.error, null) === null)) {
    const error = order.error ?? returnable.error;
    body = (
      <ErrorState
        message={COPY.loadFailed}
        onRetry={() => {
          void order.refetch();
          void returnable.refetch();
        }}
        correlationId={isApiError(error) ? (error.correlationId ?? undefined) : undefined}
      />
    );
  } else if (returnable.isError || sellerOrder === undefined) {
    // The error carries no date: the end is the delivery time + the return window (spec 01 SF-26 copy).
    const windowEnd = sellerOrder === undefined ? null : returnWindowEnd(sellerOrder);
    body = <EmptyState title={readRefusal(returnable.error, windowEnd) ?? COPY.notAllowed} action={back} />;
  } else {
    body = (
      <>
        <p className="text-sm text-muted-foreground">
          {COPY.subtitle(order.data.orderNumber, sellerOrder.businessName)}
        </p>
        <ReturnForm
          order={order.data}
          sellerOrder={sellerOrder}
          returnable={returnable.data}
          onStale={() => void returnable.refetch()}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={COPY.title} />
      {body}
    </div>
  );
}
