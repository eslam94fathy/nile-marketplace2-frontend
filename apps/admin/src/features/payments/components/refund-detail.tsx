'use client';

import { isApiError } from '@nile/api';
import {
  formatDateTime,
  formatMoney,
  REFUND_METHOD_LABELS,
  REFUND_PAYOUT_METHOD_LABELS,
  REFUND_REASON_LABELS,
  REFUND_STATUS_LABELS,
} from '@nile/domain';
import { errorMessage } from '@nile/query';
import {
  Button,
  buttonVariants,
  ConfirmDialog,
  ErrorState,
  NotFoundScreen,
  PageHeader,
  REFUND_STATUS_TONES,
  Skeleton,
  StatusBadge,
  toast,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useActorLabel } from '@/features/lookups';
import { orderPath, paymentPath, returnPath, ROUTES } from '@/lib/routes';
import {
  isRefundMissing,
  paymentQuery,
  refundQuery,
  retryRefund,
  type AdminPayment,
  type RefundDetail as Refund,
} from '../api';
import { PAYMENTS_COPY as COPY } from '../copy';
import { RecordRefundDialog, useRefundRefresh } from './record-refund-dialog';

const linkClass = 'text-primary underline-offset-4 hover:underline';

type PayoutDetails = NonNullable<Refund['payoutDetails']>;

/** "Mobile wallet 010…" / "InstaPay name@bank": shown on this screen only, never logged or put in a toast. */
function payTo(details: PayoutDetails): string | null {
  if (details.method === 'mobile_wallet') {
    return details.walletNumber === null ? null : COPY.payToWallet(details.walletNumber);
  }
  return details.instapayAddress === null ? null : COPY.payToInstapay(details.instapayAddress);
}

export interface RefundDetailProps {
  readonly refundId: string;
  /** The signed-in admin, so "recorded by" says "you". */
  readonly currentUserId: string;
}

/** AD-34 Refund (spec 03 §7.6): every fact of one refund, Record (any `pending_manual`) and Retry (Kashier). */
export function RefundDetail({ refundId, currentUserId }: RefundDetailProps) {
  const refund = useQuery(refundQuery(refundId));
  if (refund.isError) {
    if (isRefundMissing(refund.error)) {
      return (
        <NotFoundScreen
          message={COPY.refundNotFound}
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
        <PageHeader title={COPY.refundsTitle} />
        <ErrorState
          message={COPY.refundLoadFailed}
          onRetry={() => void refund.refetch()}
          correlationId={isApiError(refund.error) ? (refund.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (refund.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <RefundContent refund={refund.data} currentUserId={currentUserId} />;
}

function RefundContent({
  refund,
  currentUserId,
}: {
  readonly refund: Refund;
  readonly currentUserId: string;
}) {
  const [dialog, setDialog] = useState<'record' | 'retry' | null>(null);
  // The payment says how the customer paid: a Kashier refund can be retried; a COD one is paid out by hand.
  const payment = useQuery(paymentQuery(refund.paymentId));
  const actor = useActorLabel(currentUserId);
  const amount = formatMoney(refund.amount);
  const details = refund.payoutDetails === null ? null : payTo(refund.payoutDetails);
  const needsAction = refund.status === 'pending_manual';
  const close = () => {
    setDialog(null);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={COPY.refundTitle(amount)}
        description={
          <StatusBadge value={refund.status} labels={REFUND_STATUS_LABELS} tones={REFUND_STATUS_TONES} />
        }
      />
      {needsAction ? (
        <div role="group" aria-label={COPY.actionsLabel} className="flex flex-wrap gap-2">
          <Button
            disabled={payment.data === undefined}
            onClick={() => {
              setDialog('record');
            }}
          >
            {COPY.record}
          </Button>
          {payment.data?.method === 'kashier' ? (
            <Button
              variant="outline"
              onClick={() => {
                setDialog('retry');
              }}
            >
              {COPY.retry}
            </Button>
          ) : null}
        </div>
      ) : null}

      {details === null ? null : <PayTo text={details} />}

      <dl aria-label={COPY.refundDetailsLabel} className="max-w-2xl space-y-2 text-sm">
        <Row label={COPY.amount}>{amount}</Row>
        <Row label={COPY.reason}>{REFUND_REASON_LABELS[refund.reason]}</Row>
        <Row label={COPY.refundMethod}>{REFUND_METHOD_LABELS[refund.method]}</Row>
        <Row label={COPY.order}>
          <Link href={orderPath(refund.orderId)} className={linkClass}>
            {COPY.orderLink(refund.orderId)}
          </Link>
        </Row>
        <Row label={COPY.payment}>
          <Link href={paymentPath(refund.paymentId)} className={linkClass}>
            {COPY.openPaymentLink}
          </Link>
        </Row>
        {refund.returnId === null ? null : (
          <Row label={COPY.returnLabel}>
            <Link href={returnPath(refund.returnId)} className={linkClass}>
              {COPY.openReturn}
            </Link>
          </Row>
        )}
        <Row label={COPY.attempts}>{refund.attemptCount}</Row>
        {refund.nextAttemptAt === null ? null : (
          <Row label={COPY.nextAttempt}>{formatDateTime(refund.nextAttemptAt)}</Row>
        )}
        {/* The API's redacted provider text (spec 10 N-2). */}
        {refund.lastError === null ? null : <Row label={COPY.lastError}>{refund.lastError}</Row>}
        {refund.providerRefundRef === null ? null : (
          <Row label={COPY.providerRefundRef}>{refund.providerRefundRef}</Row>
        )}
        {refund.succeededAt === null ? null : (
          <Row label={COPY.succeededAt}>{formatDateTime(refund.succeededAt)}</Row>
        )}
        {refund.recordedAt === null ? null : (
          <Row label={COPY.recordedAt}>
            {COPY.recordedBy(formatDateTime(refund.recordedAt), actor(refund.recordedByUserId, 'admin'))}
          </Row>
        )}
        <Row label={COPY.created}>{formatDateTime(refund.createdAt)}</Row>
      </dl>

      {dialog === 'record' && payment.data !== undefined ? (
        <RecordRefundDialog refund={refund} {...recordWording(refund, payment.data)} onClose={close} />
      ) : null}
      {dialog === 'retry' ? <RetryDialog refund={refund} onClose={close} /> : null}
    </div>
  );
}

/** Kashier: refund in the dashboard first; cash on delivery: send the money to the customer's wallet first. */
function recordWording(refund: Refund, payment: AdminPayment) {
  const amount = formatMoney(refund.amount);
  if (payment.method === 'cod' && refund.payoutDetails !== null) {
    return {
      instruction: COPY.recordInstructionCod(
        amount,
        REFUND_PAYOUT_METHOD_LABELS[refund.payoutDetails.method],
      ),
      referenceLabel: COPY.referenceTransfer,
    };
  }
  return { instruction: COPY.recordInstructionKashier(amount), referenceLabel: COPY.referenceKashier };
}

function PayTo({ text }: { readonly text: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: COPY.copied, tone: 'success' });
    } catch {
      toast({ title: COPY.copyFailed, tone: 'destructive' });
    }
  };
  return (
    <section
      aria-labelledby="refund-pay-to-heading"
      className="max-w-2xl space-y-2 rounded-lg border border-border p-4"
    >
      <h2 id="refund-pay-to-heading" className="text-lg font-semibold">
        {COPY.payTo}
      </h2>
      <p className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">{text}</span>
        <Button variant="outline" size="sm" aria-label={COPY.copyPayTo} onClick={() => void copy()}>
          {COPY.copy}
        </Button>
      </p>
    </section>
  );
}

function RetryDialog({ refund, onClose }: { readonly refund: Refund; readonly onClose: () => void }) {
  const refresh = useRefundRefresh();
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.retryTitle}
      description={COPY.retryConfirm}
      confirmLabel={COPY.retry}
      onConfirm={async () => {
        try {
          await retryRefund(refund.id);
          refresh();
          toast({ title: COPY.retried, tone: 'success' });
        } catch (error) {
          if (isApiError(error, 'REFUND_NOT_RETRYABLE') || isApiError(error, 'REFUND_NOT_FOUND')) {
            refresh();
            toast({ title: COPY.notRetryable, tone: 'destructive' });
            return;
          }
          toast({ title: errorMessage(error), tone: 'destructive' });
        }
      }}
    />
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
