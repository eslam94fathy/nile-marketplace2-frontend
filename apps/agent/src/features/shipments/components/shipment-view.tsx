'use client';

import { isApiError } from '@nile/api';
import {
  ATTEMPT_FAILURE_REASON_LABELS,
  canHandBackToSeller,
  formatDateTime,
  formatMoney,
  moneyGreaterThan,
} from '@nile/domain';
import {
  buttonVariants,
  ErrorState,
  Notice,
  PageHeader,
  SHIPMENT_STATUS_TONES,
  Skeleton,
  StatusBadge,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Phone } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { InactiveGate, useInactiveOnError } from '@/features/profile';
import { ROUTES } from '@/lib/routes';
import { isShipmentGone, shipmentQuery, type AgentShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import { dropoffAddress, mapsUrl, pickupAddress } from '../lib/address';
import { isReturnPickup, statusLabelsOf } from '../lib/kind';
import { ShipmentActions } from './shipment-actions';

const ZERO = '0.00';
/** Before this point the delivery fee may still be added to the parcel [SPEC 11 UC-DE-3]. */
const AMOUNT_PENDING_STATUSES: readonly AgentShipment['status'][] = ['assigned', 'picked_up'];
const linkClass =
  'inline-flex min-h-12 items-center gap-2 font-medium text-primary underline-offset-4 hover:underline';

const backLink = (
  <Link href={ROUTES.shipments} className={buttonVariants({ variant: 'outline', size: 'lg' })}>
    {COPY.back}
  </Link>
);

/**
 * AG-05 Shipment: everything to pick up and deliver one parcel, and its actions in a bottom bar. A return pickup
 * (spec 04 §7.3) collects at the customer first, hands over at the seller, and never shows an amount.
 */
export function ShipmentView({ shipmentId }: { readonly shipmentId: string }) {
  return (
    <InactiveGate>
      <ShipmentLoader shipmentId={shipmentId} />
    </InactiveGate>
  );
}

function ShipmentLoader({ shipmentId }: { readonly shipmentId: string }) {
  const shipment = useQuery(shipmentQuery(shipmentId));
  const [delivered, setDelivered] = useState(false);
  useInactiveOnError(shipment.error);

  if (shipment.isError) {
    if (isShipmentGone(shipment.error)) {
      // Missing or reassigned by an admin [SPEC 11]: the same answer.
      return (
        <div className="space-y-4">
          <Notice>{COPY.gone}</Notice>
          {backLink}
        </div>
      );
    }
    return (
      <ErrorState
        message={COPY.loadFailed}
        onRetry={() => void shipment.refetch()}
        correlationId={isApiError(shipment.error) ? (shipment.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  if (shipment.data === undefined) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (delivered) {
    return (
      <div className="space-y-4">
        <PageHeader title={COPY.deliveredDone} />
        <Notice tone="success">{COPY.deliveredDoneText(shipment.data.orderNumber)}</Notice>
        {backLink}
      </div>
    );
  }
  return (
    <ShipmentContent
      shipment={shipment.data}
      onDelivered={() => {
        setDelivered(true);
      }}
    />
  );
}

function ShipmentContent({
  shipment,
  onDelivered,
}: {
  readonly shipment: AgentShipment;
  readonly onDelivered: () => void;
}) {
  const { pickup, dropoff } = shipment;
  const pickupLine = pickupAddress(pickup);
  const dropoffLine = dropoffAddress(dropoff);
  const isReturn = isReturnPickup(shipment);
  const showReturnNote = shipment.status === 'returning_to_seller';
  const reasonLabels = isReturn ? ATTEMPT_FAILURE_REASON_LABELS.pickup : ATTEMPT_FAILURE_REASON_LABELS.agent;

  return (
    <div className="space-y-5 pb-20">
      <PageHeader
        title={isReturn ? COPY.returnTitle : COPY.orderNumber(shipment.orderNumber)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {isReturn ? <span>{COPY.orderNumber(shipment.orderNumber)}</span> : null}
            <StatusBadge
              value={shipment.status}
              labels={statusLabelsOf(shipment)}
              tones={SHIPMENT_STATUS_TONES}
            />
          </span>
        }
      />
      {isReturn ? (
        <>
          <CustomerCard
            id="dropoff"
            title={COPY.collectFromHeading}
            dropoff={dropoff}
            address={dropoffLine}
          />
          <SellerCard id="pickup" title={COPY.deliverToSellerHeading} pickup={pickup} address={pickupLine} />
          <Card id="payment" title={COPY.paymentHeading}>
            <p className="text-base font-semibold">{COPY.nothingToCollectSentence}</p>
          </Card>
        </>
      ) : (
        <>
          <SellerCard id="pickup" title={COPY.pickupHeading} pickup={pickup} address={pickupLine} />
          <CustomerCard id="dropoff" title={COPY.dropoffHeading} dropoff={dropoff} address={dropoffLine} />
          <PaymentCard shipment={shipment} />
        </>
      )}
      {shipment.attempts.length === 0 ? null : (
        <Card id="attempts" title={isReturn ? COPY.pickupAttemptsHeading : COPY.attemptsHeading}>
          <ol className="space-y-2">
            {shipment.attempts.map((attempt) => (
              <li key={attempt.attemptNumber} className="text-sm">
                <span className="font-medium">
                  {COPY.attempt(attempt.attemptNumber)}: {reasonLabels[attempt.reason]}
                </span>
                <span className="block text-muted-foreground">
                  {formatDateTime(attempt.createdAt)}
                  {attempt.note === null ? null : ` · ${attempt.note}`}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <Card id="times" title={COPY.timesHeading}>
        <dl className="space-y-1 text-sm">
          <Time label={COPY.assigned} value={shipment.assignedAt} />
          <Time label={isReturn ? COPY.collectedTime : COPY.pickedUp} value={shipment.pickedUpAt} />
          <Time label={isReturn ? COPY.handedTime : COPY.delivered} value={shipment.deliveredAt} />
        </dl>
      </Card>
      {/* A normal return is closed by the seller (AG-Q-1): no action here, only the note. */}
      {showReturnNote && !canHandBackToSeller(shipment) ? (
        <Notice>{COPY.returnNote(pickup.businessName)}</Notice>
      ) : null}
      <ShipmentActions shipment={shipment} onDelivered={onDelivered} />
    </div>
  );
}

function SellerCard({
  id,
  title,
  pickup,
  address,
}: {
  readonly id: string;
  readonly title: string;
  readonly pickup: AgentShipment['pickup'];
  readonly address: string;
}) {
  return (
    <Card id={id} title={title}>
      <p className="text-lg font-semibold">{pickup.businessName}</p>
      <a href={`tel:${pickup.phone}`} className={linkClass} aria-label={COPY.call(pickup.businessName)}>
        <Phone aria-hidden="true" className="size-5" />
        {pickup.phone}
      </a>
      <p className="text-base">{address}</p>
      <MapsLink address={address} place={pickup.businessName} />
    </Card>
  );
}

function CustomerCard({
  id,
  title,
  dropoff,
  address,
}: {
  readonly id: string;
  readonly title: string;
  readonly dropoff: AgentShipment['dropoff'];
  readonly address: string;
}) {
  return (
    <Card id={id} title={title}>
      <p className="text-lg font-semibold">{dropoff.recipientName}</p>
      <a
        href={`tel:${dropoff.recipientPhone}`}
        className={linkClass}
        aria-label={COPY.call(dropoff.recipientName)}
      >
        <Phone aria-hidden="true" className="size-5" />
        {dropoff.recipientPhone}
      </a>
      <p className="text-base">{address}</p>
      <MapsLink address={address} place={dropoff.recipientName} />
    </Card>
  );
}

/** A delivery's money: cash to collect (final once the delivery starts) or prepaid. */
function PaymentCard({ shipment }: { readonly shipment: AgentShipment }) {
  const amountPending = AMOUNT_PENDING_STATUSES.includes(shipment.status);
  return (
    <Card id="payment" title={COPY.paymentHeading}>
      {shipment.paymentMethod === 'cod' ? (
        <>
          <p className="text-base">
            {COPY.collectInCash}:{' '}
            <span className={amountPending ? 'font-semibold' : 'text-2xl font-bold tabular-nums'}>
              {formatMoney(shipment.amountToCollect)}
            </span>
          </p>
          {moneyGreaterThan(shipment.codFeeAmount, ZERO) ? (
            <p className="text-sm text-muted-foreground">
              {COPY.breakdown(formatMoney(shipment.codItemsAmount), formatMoney(shipment.codFeeAmount))}
            </p>
          ) : null}
          {amountPending ? (
            <p className="text-sm text-muted-foreground">{COPY.amountConfirmedLater}</p>
          ) : null}
        </>
      ) : (
        <p className="text-base font-semibold">{COPY.prepaid}</p>
      )}
    </Card>
  );
}

function MapsLink({ address, place }: { readonly address: string; readonly place: string }) {
  return (
    <a
      href={mapsUrl(address)}
      target="_blank"
      rel="noopener noreferrer"
      className={linkClass}
      aria-label={COPY.openInMapsFor(place)}
    >
      <MapPin aria-hidden="true" className="size-5" />
      {COPY.openInMaps}
    </a>
  );
}

function Card({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-2 rounded-lg border border-border p-4">
      <h2
        id={`${id}-heading`}
        className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Time({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value === null ? COPY.none : formatDateTime(value)}</dd>
    </div>
  );
}
