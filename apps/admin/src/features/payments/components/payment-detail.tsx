'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, formatMoney, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@nile/domain';
import {
  Badge,
  buttonVariants,
  DataTable,
  ErrorState,
  NotFoundScreen,
  PageHeader,
  PAYMENT_STATUS_TONES,
  Skeleton,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { orderPath, paymentPath, ROUTES } from '@/lib/routes';
import { isPaymentMissing, orderPaymentQuery, paymentQuery, type AdminPayment } from '../api';
import { PAYMENTS_COPY as COPY } from '../copy';
import { RefundsTable } from './refunds-table';

type PaymentEvent = AdminPayment['events'][number];

const linkClass = 'text-primary underline-offset-4 hover:underline';

export interface PaymentDetailProps {
  readonly paymentId: string;
  readonly currentUserId: string;
}

/** AD-17 Payment: amounts, Kashier references, refunds (with Record) and events (no payloads, SPEC 10). */
export function PaymentDetail({ paymentId, currentUserId }: PaymentDetailProps) {
  const payment = useQuery(paymentQuery(paymentId));
  if (payment.isError) {
    if (isPaymentMissing(payment.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.refunds} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToRefunds}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.paymentTitle} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void payment.refetch()}
          correlationId={isApiError(payment.error) ? (payment.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (payment.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  const data = payment.data;
  const eventColumns: readonly DataTableColumn<PaymentEvent>[] = [
    { id: 'type', header: COPY.eventColumns.type, cell: (row) => row.eventType },
    {
      id: 'signature',
      header: COPY.eventColumns.signature,
      cell: (row) => (
        <Badge tone={row.signatureValid ? 'success' : 'destructive'}>
          {row.signatureValid ? COPY.signatureValid : COPY.signatureInvalid}
        </Badge>
      ),
    },
    {
      id: 'processed',
      header: COPY.eventColumns.processed,
      cell: (row) => (row.processedAt === null ? COPY.notProcessed : formatDateTime(row.processedAt)),
    },
    { id: 'received', header: COPY.eventColumns.received, cell: (row) => formatDateTime(row.createdAt) },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={COPY.paymentTitle}
        description={
          <StatusBadge value={data.status} labels={PAYMENT_STATUS_LABELS} tones={PAYMENT_STATUS_TONES} />
        }
      />
      <Section id="payment-details" title={COPY.detailsHeading}>
        <dl className="max-w-2xl space-y-2 text-sm">
          <Row label={COPY.order}>
            <Link href={orderPath(data.orderId)} className={linkClass}>
              {COPY.orderLink(data.orderId)}
            </Link>
          </Row>
          <PaymentRows payment={data} />
          <Row label={COPY.providerOrderRef}>{data.providerOrderRef ?? COPY.none}</Row>
          <Row label={COPY.providerTransactionRef}>{data.providerTransactionRef ?? COPY.none}</Row>
          <Row label={COPY.paidAt}>{data.paidAt === null ? COPY.none : formatDateTime(data.paidAt)}</Row>
          <Row label={COPY.created}>{formatDateTime(data.createdAt)}</Row>
        </dl>
      </Section>
      <Section id="payment-refunds" title={COPY.refundsHeading}>
        <RefundsTable
          caption={COPY.paymentRefundsCaption}
          rows={data.refunds}
          currentUserId={currentUserId}
          empty={<p className="text-sm text-muted-foreground">{COPY.noRefunds}</p>}
        />
      </Section>
      <Section id="payment-events" title={COPY.eventsHeading}>
        <DataTable
          caption={COPY.eventsCaption}
          columns={eventColumns}
          rows={data.events}
          getRowId={(row) => row.id}
          empty={<p className="text-sm text-muted-foreground">{COPY.noEvents}</p>}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      </Section>
    </div>
  );
}

/** AD-15 item 6: amount, collected, refunded and status, a link to AD-17 and the order's refunds. */
export function OrderPaymentSummary({
  orderId,
  currentUserId,
}: {
  readonly orderId: string;
  readonly currentUserId: string;
}) {
  const payment = useQuery(orderPaymentQuery(orderId));
  let body: ReactNode;
  if (payment.isError) {
    body = isApiError(payment.error, 'PAYMENT_NOT_FOUND') ? (
      <p className="text-sm text-muted-foreground">{COPY.noPayment}</p>
    ) : (
      <ErrorState
        message={COPY.summaryFailed}
        onRetry={() => void payment.refetch()}
        correlationId={isApiError(payment.error) ? (payment.error.correlationId ?? undefined) : undefined}
      />
    );
  } else if (payment.data === undefined) {
    body = <Skeleton className="h-32 max-w-2xl" />;
  } else {
    body = (
      <>
        <dl className="max-w-2xl space-y-2 text-sm">
          <Row label={COPY.status}>
            <StatusBadge
              value={payment.data.status}
              labels={PAYMENT_STATUS_LABELS}
              tones={PAYMENT_STATUS_TONES}
            />
          </Row>
          <PaymentRows payment={payment.data} />
        </dl>
        <Link href={paymentPath(payment.data.id)} className={`text-sm ${linkClass}`}>
          {COPY.openPayment}
        </Link>
        <RefundsTable
          caption={COPY.orderRefundsCaption}
          rows={payment.data.refunds}
          currentUserId={currentUserId}
          empty={<p className="text-sm text-muted-foreground">{COPY.noRefunds}</p>}
        />
      </>
    );
  }
  return (
    <Section id="order-payment" title={COPY.summaryHeading}>
      {body}
    </Section>
  );
}

function PaymentRows({ payment }: { readonly payment: AdminPayment }) {
  return (
    <>
      <Row label={COPY.method}>{PAYMENT_METHOD_LABELS[payment.method]}</Row>
      <Row label={COPY.amount}>{formatMoney(payment.amount)}</Row>
      <Row label={COPY.collected}>{formatMoney(payment.collectedAmount)}</Row>
      <Row label={COPY.refunded}>{formatMoney(payment.refundedAmount)}</Row>
    </>
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
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-3">
      <h2 id={`${id}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[13rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
