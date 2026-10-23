import { formatDateTime, formatMoney, MAX_DELIVERY_ATTEMPTS, SHIPMENT_STATUS_LABELS } from '@nile/domain';
import { SHIPMENT_STATUS_TONES, StatusBadge } from '@nile/ui';
import Link from 'next/link';
import { shipmentPath } from '@/lib/routes';
import type { AgentShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';

/** AG-04 card: the whole card is one link to AG-05 (a large touch target). */
export function ShipmentCard({ shipment }: { readonly shipment: AgentShipment }) {
  const { pickup, dropoff } = shipment;
  return (
    <Link
      href={shipmentPath(shipment.id)}
      className="block space-y-2 rounded-lg border border-border p-4 hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{COPY.orderNumber(shipment.orderNumber)}</span>
        <StatusBadge
          value={shipment.status}
          labels={SHIPMENT_STATUS_LABELS.agent}
          tones={SHIPMENT_STATUS_TONES}
        />
      </span>
      <span className="block text-sm">
        <span className="text-muted-foreground">{COPY.pickupFrom}: </span>
        {pickup.businessName}, {pickup.area}, {pickup.city}
      </span>
      <span className="block text-sm">
        <span className="text-muted-foreground">{COPY.deliverTo}: </span>
        {dropoff.area}, {dropoff.city}, {dropoff.governorateName}
      </span>
      <span className="block text-base font-semibold">
        {shipment.paymentMethod === 'cod'
          ? COPY.collect(formatMoney(shipment.amountToCollect))
          : COPY.prepaid}
      </span>
      <span className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
        {shipment.status === 'delivery_failed' ? (
          <span>{COPY.nextAttempt(shipment.attemptCount + 1, MAX_DELIVERY_ATTEMPTS)}</span>
        ) : null}
        {shipment.assignedAt === null ? null : (
          <span>{COPY.assignedAt(formatDateTime(shipment.assignedAt))}</span>
        )}
      </span>
    </Link>
  );
}
