'use client';

import { isApiError } from '@nile/api';
import {
  ATTEMPT_FAILURE_REASON_LABELS,
  formatDateTime,
  formatMoney,
  PAYMENT_METHOD_LABELS,
  SHIPMENT_KIND_LABELS,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_STATUSES,
  type ShipmentStatus,
} from '@nile/domain';
import {
  Button,
  buttonVariants,
  DataTable,
  ErrorState,
  Notice,
  NotFoundScreen,
  PageHeader,
  SHIPMENT_STATUS_TONES,
  Skeleton,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useActorLabel, useAgentNames, useGovernorateName } from '@/features/lookups';
import { agentPath, orderPath, returnPath, ROUTES } from '@/lib/routes';
import { isShipmentMissing, shipmentQuery, type AdminShipment } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import { isAssignable } from '../lib/assign';
import { AssignDialog } from './assign-dialog';

type Attempt = AdminShipment['attempts'][number];
type HistoryEntry = NonNullable<AdminShipment['history']>[number];

const linkClass = 'text-primary underline-offset-4 hover:underline';

/** History statuses are plain strings in the API: known ones get their label, anything else shows as is. */
const statusLabel = (status: string): string =>
  (SHIPMENT_STATUSES as readonly string[]).includes(status)
    ? SHIPMENT_STATUS_LABELS.admin[status as ShipmentStatus]
    : status;

export interface ShipmentDetailProps {
  readonly shipmentId: string;
  readonly currentUserId: string;
}

/** AD-13 Shipment: everything about one shipment, its attempts and history, and Assign / Reassign. */
export function ShipmentDetail({ shipmentId, currentUserId }: ShipmentDetailProps) {
  const shipment = useQuery(shipmentQuery(shipmentId));
  if (shipment.isError) {
    if (isShipmentMissing(shipment.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.shipments} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToShipments}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.title} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void shipment.refetch()}
          correlationId={isApiError(shipment.error) ? (shipment.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (shipment.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <ShipmentContent shipment={shipment.data} currentUserId={currentUserId} />;
}

function ShipmentContent({
  shipment,
  currentUserId,
}: {
  readonly shipment: AdminShipment;
  readonly currentUserId: string;
}) {
  const [assigning, setAssigning] = useState(false);
  const actor = useActorLabel(currentUserId);
  const governorates = useGovernorateName();
  const agentName = useAgentNames([shipment.agentId]);
  const { pickup, dropoff } = shipment;
  const isReturn = shipment.kind === 'return';
  const pickupSection = (
    <Section id="shipment-pickup" title={isReturn ? COPY.deliverToSeller : COPY.pickupHeading} list>
      <Row label={COPY.business}>{pickup.businessName}</Row>
      <Row label={COPY.phone}>{pickup.phone}</Row>
      <Row label={COPY.address}>
        {[
          `${pickup.building} ${pickup.street}`,
          pickup.area,
          pickup.city,
          governorates.name(pickup.governorateId),
          ...(pickup.landmark === null ? [] : [pickup.landmark]),
        ].join(', ')}
      </Row>
    </Section>
  );
  const dropoffSection = (
    <Section id="shipment-dropoff" title={isReturn ? COPY.collectFromCustomer : COPY.dropoffHeading} list>
      <Row label={COPY.recipient}>{dropoff.recipientName}</Row>
      <Row label={COPY.phone}>{dropoff.recipientPhone}</Row>
      <Row label={COPY.address}>
        {[
          `${dropoff.building} ${dropoff.street}`,
          ...(dropoff.floor === null ? [] : [COPY.floor(dropoff.floor)]),
          ...(dropoff.apartment === null ? [] : [COPY.apartment(dropoff.apartment)]),
          dropoff.area,
          dropoff.city,
          dropoff.governorateName,
          ...(dropoff.landmark === null ? [] : [dropoff.landmark]),
        ].join(', ')}
      </Row>
    </Section>
  );
  const dateOrNone = (iso: string | null) => (iso === null ? COPY.none : formatDateTime(iso));

  const attemptColumns: readonly DataTableColumn<Attempt>[] = [
    { id: 'number', header: COPY.attemptColumns.number, align: 'end', cell: (row) => row.attemptNumber },
    {
      id: 'reason',
      header: COPY.attemptColumns.reason,
      cell: (row) => ATTEMPT_FAILURE_REASON_LABELS.admin[row.reason],
    },
    { id: 'note', header: COPY.attemptColumns.note, cell: (row) => row.note ?? COPY.none },
    { id: 'date', header: COPY.attemptColumns.date, cell: (row) => formatDateTime(row.createdAt) },
  ];
  const historyColumns: readonly DataTableColumn<HistoryEntry>[] = [
    {
      id: 'change',
      header: COPY.historyColumns.change,
      cell: (row) =>
        `${row.fromStatus === null ? COPY.createdStep : statusLabel(row.fromStatus)}${COPY.arrow}${statusLabel(row.toStatus)}`,
    },
    { id: 'reason', header: COPY.historyColumns.reason, cell: (row) => row.reason ?? COPY.none },
    { id: 'by', header: COPY.historyColumns.by, cell: (row) => actor(row.actorUserId, row.actorRole) },
    { id: 'date', header: COPY.historyColumns.date, cell: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={COPY.orderNumber(shipment.orderNumber)}
        description={
          <StatusBadge
            value={shipment.status}
            labels={SHIPMENT_STATUS_LABELS.admin}
            tones={SHIPMENT_STATUS_TONES}
          />
        }
        actions={
          isAssignable(shipment) ? (
            <Button
              onClick={() => {
                setAssigning(true);
              }}
            >
              {shipment.agentId === null ? COPY.assign : COPY.reassign}
            </Button>
          ) : undefined
        }
      />
      {shipment.sellerOrderCancelledAt === null ? null : (
        <Notice>{COPY.sellerOrderCancelled(formatDateTime(shipment.sellerOrderCancelledAt))}</Notice>
      )}
      <div className="grid gap-8 lg:grid-cols-2">
        <Section id="shipment-overview" title={COPY.overviewHeading} list>
          <Row label={COPY.order}>
            <Link href={orderPath(shipment.orderId)} className={linkClass}>
              {shipment.orderNumber}
            </Link>
          </Row>
          <Row label={COPY.sellerOrder}>{COPY.shortId(shipment.sellerOrderId)}</Row>
          <Row label={COPY.kind}>{SHIPMENT_KIND_LABELS.admin[shipment.kind]}</Row>
          {shipment.returnId === null ? null : (
            <Row label={COPY.return}>
              <Link href={returnPath(shipment.returnId)} className={linkClass}>
                {COPY.returnLink(shipment.returnId)}
              </Link>
            </Row>
          )}
          <Row label={COPY.paymentMethod}>{PAYMENT_METHOD_LABELS[shipment.paymentMethod]}</Row>
          <Row label={COPY.created}>{formatDateTime(shipment.createdAt)}</Row>
        </Section>
        <Section id="shipment-agent" title={COPY.agentHeading} list>
          <Row label={COPY.agent}>
            {shipment.agentId === null ? (
              COPY.unassigned
            ) : (
              <Link href={agentPath(shipment.agentId)} className={linkClass}>
                {agentName(shipment.agentId) ?? COPY.shortId(shipment.agentId)}
              </Link>
            )}
          </Row>
          <Row label={COPY.assignedAt}>{dateOrNone(shipment.assignedAt)}</Row>
          <Row label={COPY.pickedUpAt}>{dateOrNone(shipment.pickedUpAt)}</Row>
          <Row label={COPY.deliveredAt}>{dateOrNone(shipment.deliveredAt)}</Row>
        </Section>
        {/* The DTO keeps each address by party (SPEC 11 DE-26); a return runs customer → seller, so it lists the
            customer first. */}
        {isReturn ? (
          <>
            {dropoffSection}
            {pickupSection}
          </>
        ) : (
          <>
            {pickupSection}
            {dropoffSection}
            <Section id="shipment-money" title={COPY.moneyHeading} list>
              <Row label={COPY.codItems}>{formatMoney(shipment.codItemsAmount)}</Row>
              <Row label={COPY.codFee}>{formatMoney(shipment.codFeeAmount)}</Row>
              <Row label={COPY.toCollect}>{formatMoney(shipment.amountToCollect)}</Row>
              <Row label={COPY.carriesFee}>{shipment.carriesDeliveryFee ? COPY.yes : COPY.no}</Row>
              <Row label={COPY.codCollected}>
                {shipment.codCollectedAmount === null ? COPY.none : formatMoney(shipment.codCollectedAmount)}
              </Row>
            </Section>
          </>
        )}
      </div>
      <Section id="shipment-attempts" title={isReturn ? COPY.pickupAttemptsHeading : COPY.attemptsHeading}>
        <DataTable
          caption={isReturn ? COPY.pickupAttemptsHeading : COPY.attemptsCaption}
          columns={attemptColumns}
          rows={shipment.attempts}
          getRowId={(row) => String(row.attemptNumber)}
          empty={<p className="text-sm text-muted-foreground">{COPY.noAttempts}</p>}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      </Section>
      <Section id="shipment-history" title={COPY.historyHeading}>
        <DataTable
          caption={COPY.historyCaption}
          columns={historyColumns}
          rows={shipment.history ?? []}
          getRowId={(row) => `${row.createdAt}-${row.toStatus}`}
          empty={<p className="text-sm text-muted-foreground">{COPY.noHistory}</p>}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      </Section>
      {assigning ? (
        <AssignDialog
          shipment={shipment}
          onClose={() => {
            setAssigning(false);
          }}
        />
      ) : null}
    </div>
  );
}

interface SectionProps {
  readonly id: string;
  readonly title: string;
  /** The children are `Row`s of a description list. */
  readonly list?: boolean;
  readonly children: ReactNode;
}

function Section({ id, title, list = false, children }: SectionProps) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {list ? <dl className="space-y-2 text-sm">{children}</dl> : children}
    </section>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
