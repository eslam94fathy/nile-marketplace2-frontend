'use client';

import { isApiError } from '@nile/api';
import {
  ACTOR_ROLE_LABELS,
  formatDateTime,
  formatMoney,
  REFUND_PAYOUT_METHOD_LABELS,
  RETURN_FEE_PAYER_LABELS,
  RETURN_REASON_LABELS,
  RETURN_REFUND_STATUS_LABELS,
  RETURN_REFUSAL_REASON_LABELS,
  RETURN_STATUS_LABELS,
} from '@nile/domain';
import {
  Button,
  buttonVariants,
  DataTable,
  ErrorState,
  Money,
  NileImage,
  NotFoundScreen,
  PageHeader,
  PrivateImage,
  RETURN_REFUND_STATUS_TONES,
  RETURN_STATUS_TONES,
  Skeleton,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { customerQuery } from '@/features/customers';
import { useActorLabel, useAgentNames, useSellerNames } from '@/features/lookups';
import { agentPath, customerPath, orderPath, ROUTES, sellerPath, shipmentPath } from '@/lib/routes';
import { isReturnMissing, returnQuery, returnShipmentQuery, type AdminReturn } from '../api';
import { RETURNS_COPY as COPY } from '../copy';
import { currentDeadline } from '../lib/deadline';
import { DecisionDialog, type ReturnAction } from './decision-dialog';

const LINK = 'text-primary underline-offset-4 hover:underline';

type HistoryEntry = AdminReturn['history'][number];

export interface ReturnDetailProps {
  readonly returnId: string;
  /** The signed-in admin, so the history says "you". */
  readonly currentUserId: string;
}

/** AD-33 Return: everything of SF-28 plus the parties, the return shipment and the full history (spec 03 §7.6). */
export function ReturnDetail({ returnId, currentUserId }: ReturnDetailProps) {
  const query = useQuery(returnQuery(returnId));
  if (query.isError) {
    if (isReturnMissing(query.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.returns} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToReturns}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.returnTitle} />
        <ErrorState
          message={COPY.returnLoadFailed}
          onRetry={() => void query.refetch()}
          correlationId={isApiError(query.error) ? (query.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (query.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return (
    <ReturnContent item={query.data} currentUserId={currentUserId} onExpired={() => void query.refetch()} />
  );
}

function ReturnContent({
  item,
  currentUserId,
  onExpired,
}: {
  readonly item: AdminReturn;
  readonly currentUserId: string;
  readonly onExpired: () => void;
}) {
  const [action, setAction] = useState<ReturnAction | null>(null);
  const sellerName = useSellerNames([item.sellerId]);
  const agentName = useAgentNames([item.agentId]);
  const customer = useQuery(customerQuery(item.customerId));
  const customerName =
    customer.data === undefined ? null : `${customer.data.firstName} ${customer.data.lastName}`.trim();
  const deadline = currentDeadline(item);
  const actionButton = (next: ReturnAction, label: string, variant: 'primary' | 'outline' = 'outline') => (
    <Button
      variant={variant}
      onClick={() => {
        setAction(next);
      }}
    >
      {label}
    </Button>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={COPY.returnNumber(item.returnNumber)}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge
              value={item.status}
              labels={RETURN_STATUS_LABELS.admin}
              tones={RETURN_STATUS_TONES}
            />
            <Link href={orderPath(item.orderId)} className={`font-medium ${LINK}`}>
              {COPY.orderNumber(item.orderNumber)}
            </Link>
          </span>
        }
      />
      {item.status === 'requested' || item.status === 'escalated' ? (
        <div role="group" aria-label={COPY.actionsLabel} className="flex flex-wrap gap-2">
          {actionButton('approve', COPY.approve, 'primary')}
          {actionButton('reject', COPY.reject)}
        </div>
      ) : null}
      {item.status === 'disputed' ? (
        <div role="group" aria-label={COPY.actionsLabel} className="flex flex-wrap gap-2">
          {actionButton('refund', COPY.refund, 'primary')}
          {actionButton('no_refund', COPY.noRefund)}
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2">
        <dl aria-label={COPY.detailsLabel} className="space-y-2 text-sm">
          <Row label={COPY.customer}>
            <Link href={customerPath(item.customerId)} className={LINK}>
              {customerName ?? COPY.shortId(item.customerId)}
            </Link>
          </Row>
          <Row label={COPY.seller}>
            <Link href={sellerPath(item.sellerId)} className={LINK}>
              {sellerName(item.sellerId) ?? COPY.shortId(item.sellerId)}
            </Link>
          </Row>
          <Row label={COPY.agent}>
            {item.agentId === null ? (
              COPY.noAgent
            ) : (
              <Link href={agentPath(item.agentId)} className={LINK}>
                {agentName(item.agentId) ?? COPY.shortId(item.agentId)}
              </Link>
            )}
          </Row>
          <Row label={COPY.created}>{formatDateTime(item.createdAt)}</Row>
          <Row label={COPY.reason}>{RETURN_REASON_LABELS.staff[item.reason]}</Row>
          {item.rejectionReason === null ? null : <Row label={COPY.sellerReason}>{item.rejectionReason}</Row>}
          {item.refusalReason === null ? null : (
            <Row label={COPY.refusal}>{RETURN_REFUSAL_REASON_LABELS.admin[item.refusalReason]}</Row>
          )}
          {deadline === null ? null : (
            <Row label={COPY.deadlines[deadline.kind]}>{formatDateTime(deadline.at)}</Row>
          )}
        </dl>
        <Section id="refund" title={COPY.refundHeading}>
          <dl className="space-y-2 text-sm">
            <Row label={COPY.returnFee}>
              {COPY.feePaidBy(formatMoney(item.returnFee), RETURN_FEE_PAYER_LABELS[item.returnFeePayer])}
            </Row>
            <Row label={COPY.refundAmount}>
              <Money value={item.refundAmount} />
            </Row>
            {item.refund === null ? null : (
              <>
                <Row label={COPY.refundStatus}>
                  <StatusBadge
                    value={item.refund.status}
                    labels={RETURN_REFUND_STATUS_LABELS}
                    tones={RETURN_REFUND_STATUS_TONES}
                  />
                </Row>
                {item.refund.refundedAt === null ? null : (
                  <Row label={COPY.refundedAt}>{formatDateTime(item.refund.refundedAt)}</Row>
                )}
              </>
            )}
            {item.payoutMethod === null ? null : (
              <Row label={COPY.payoutMethod}>
                <span className="flex flex-col">
                  <span>{REFUND_PAYOUT_METHOD_LABELS[item.payoutMethod]}</span>
                  {/* The details stay on the refund (AD-34, spec 18 §4): never shown or kept here. */}
                  <span className="text-muted-foreground">{COPY.payoutDetailsNote}</span>
                </span>
              </Row>
            )}
          </dl>
        </Section>
      </div>

      {item.description === null ? null : (
        <Section id="description" title={COPY.descriptionHeading}>
          {/* Customer text, rendered as text (CLAUDE.md §7). */}
          <p className="max-w-2xl text-sm whitespace-pre-line">{item.description}</p>
        </Section>
      )}

      {item.photos.length === 0 ? null : (
        <Section id="photos" title={COPY.photosHeading}>
          <ul className="flex flex-wrap gap-3">
            {item.photos.map((photo, index) => (
              <li key={photo.id}>
                {/* Private, expiring URLs (conventions §12.1): a failed load reads the return again once. */}
                <PrivateImage
                  image={photo}
                  alt={COPY.photoAlt(index + 1, item.photos.length)}
                  sizes="128px"
                  onExpired={onExpired}
                  className="size-32 rounded-md object-cover"
                />
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section id="items" title={COPY.itemsHeading}>
        <ul className="max-w-3xl divide-y divide-border rounded-lg border border-border">
          {item.items.map((line) => (
            <li key={line.id} className="flex flex-wrap items-center gap-4 p-3 text-sm">
              <NileImage
                image={line.image}
                alt=""
                sizes="56px"
                placeholder="product"
                className="size-14 rounded-md bg-muted object-cover"
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">{line.productName}</p>
                {line.attributes.length === 0 ? null : (
                  <p className="text-muted-foreground">
                    {line.attributes.map((option) => `${option.attribute}: ${option.value}`).join(' · ')}
                  </p>
                )}
                <p className="text-muted-foreground">{COPY.quantity(line.quantity)}</p>
                {line.restock === null ? null : (
                  <p className="text-muted-foreground">{line.restock ? COPY.restocked : COPY.notRestocked}</p>
                )}
              </div>
              <p>
                <span className="sr-only">{COPY.paid}: </span>
                <Money value={line.paidAmount} />
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <ReturnShipment item={item} />
      <History item={item} currentUserId={currentUserId} />

      {action === null ? null : (
        <DecisionDialog
          item={item}
          action={action}
          onClose={() => {
            setAction(null);
          }}
        />
      )}
    </div>
  );
}

function ReturnShipment({ item }: { readonly item: AdminReturn }) {
  const shipment = useQuery(returnShipmentQuery(item));
  let content: ReactNode;
  if (shipment.isPending) content = <Skeleton className="h-4 w-40" />;
  else if (shipment.isError) content = <p className="text-sm text-destructive">{COPY.shipmentFailed}</p>;
  else if (shipment.data === null)
    content = <p className="text-sm text-muted-foreground">{COPY.noShipment}</p>;
  else {
    content = (
      <Link href={shipmentPath(shipment.data.id)} className={`text-sm ${LINK}`}>
        {COPY.openShipment}
      </Link>
    );
  }
  return (
    <Section id="shipment" title={COPY.shipmentHeading}>
      {content}
    </Section>
  );
}

function History({ item, currentUserId }: { readonly item: AdminReturn; readonly currentUserId: string }) {
  const actor = useActorLabel(currentUserId);
  const label = (status: HistoryEntry['to']) => RETURN_STATUS_LABELS.admin[status];
  const columns: readonly DataTableColumn<HistoryEntry>[] = [
    {
      id: 'change',
      header: COPY.historyColumns.change,
      cell: (entry) =>
        `${entry.from === null ? COPY.createdStep : label(entry.from)}${COPY.arrow}${label(entry.to)}`,
    },
    {
      id: 'by',
      header: COPY.historyColumns.by,
      // The return history names the role even without a user (a job is `system`), so a missing id reads as its role.
      cell: (entry) =>
        entry.actorUserId === null
          ? ACTOR_ROLE_LABELS[entry.actorRole]
          : actor(entry.actorUserId, entry.actorRole),
    },
    { id: 'reason', header: COPY.historyColumns.reason, cell: (entry) => entry.reason ?? COPY.none },
    { id: 'date', header: COPY.historyColumns.date, cell: (entry) => formatDateTime(entry.at) },
  ];
  return (
    <Section id="history" title={COPY.historyHeading}>
      <DataTable
        caption={COPY.historyCaption}
        columns={columns}
        rows={[...item.history].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))}
        getRowId={(entry) => `${entry.to}-${entry.at}`}
        empty={null}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => undefined}
      />
    </Section>
  );
}

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  const headingId = `return-${id}-heading`;
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
