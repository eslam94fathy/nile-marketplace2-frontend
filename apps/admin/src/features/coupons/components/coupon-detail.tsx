'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which portal pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import {
  COUPON_DISPLAY_STATUS_LABELS,
  COUPON_FUNDING_LABELS,
  COUPON_SCOPE_LABELS,
  fields,
  formatDateTime,
  formatMoney,
  REDEMPTION_STATUS_LABELS,
} from '@nile/domain';
import { errorMessage } from '@nile/query';
import {
  Badge,
  Button,
  buttonVariants,
  ConfirmDialog,
  COUPON_DISPLAY_STATUS_TONES,
  DataTable,
  ErrorState,
  Field,
  FormAlert,
  NotFoundScreen,
  PageHeader,
  Skeleton,
  StatusBadge,
  Textarea,
  toast,
  type DataTableColumn,
} from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { categoryTreeQuery } from '@/features/catalog';
import { useSellerNames } from '@/features/lookups';
import { customerPath, orderPath, ROUTES, sellerPath } from '@/lib/routes';
import {
  blockCoupon,
  couponKeys,
  couponQuery,
  isCouponMissing,
  unblockCoupon,
  type CouponDetail as Coupon,
  type Redemption,
} from '../api';
import { COUPONS_COPY as COPY } from '../copy';
import { categoryChoices, discountText, scopeText } from '../lib/display';
import { CouponForm } from './coupon-form';

const LINK = 'text-primary underline-offset-4 hover:underline';

/** AD-37 Coupon (spec 03 §7.6): a platform coupon's edit form, or a seller coupon read-only with Block / Unblock. */
export function CouponDetail({ couponId }: { readonly couponId: string }) {
  const coupon = useQuery(couponQuery(couponId));
  if (coupon.isError) {
    if (isCouponMissing(coupon.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.coupons} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToCoupons}
            </Link>
          }
        />
      );
    }
    return (
      <div className="space-y-6">
        <PageHeader title={COPY.couponTitle} />
        <ErrorState
          message={COPY.loadFailed}
          onRetry={() => void coupon.refetch()}
          correlationId={isApiError(coupon.error) ? (coupon.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (coupon.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <CouponContent coupon={coupon.data} />;
}

function CouponContent({ coupon }: { readonly coupon: Coupon }) {
  const [dialog, setDialog] = useState<'block' | 'unblock' | null>(null);
  const sellerName = useSellerNames([coupon.sellerId, coupon.scopeSellerId]);
  const tree = useQuery(categoryTreeQuery());
  const categories = useMemo(() => categoryChoices(tree.data ?? []), [tree.data]);
  const isSellers = coupon.funding === 'seller';
  const close = () => {
    setDialog(null);
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={coupon.code}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge
              value={coupon.displayStatus}
              labels={COUPON_DISPLAY_STATUS_LABELS}
              tones={COUPON_DISPLAY_STATUS_TONES}
            />
            {coupon.adminBlocked ? <Badge tone="destructive">{COPY.blockedBadge}</Badge> : null}
          </span>
        }
      />
      {isSellers ? (
        <div role="group" aria-label={COPY.actionsLabel} className="flex flex-wrap gap-2">
          {coupon.adminBlocked ? (
            <Button
              variant="outline"
              onClick={() => {
                setDialog('unblock');
              }}
            >
              {COPY.unblock}
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => {
                setDialog('block');
              }}
            >
              {COPY.block}
            </Button>
          )}
        </div>
      ) : null}

      <dl aria-label={COPY.detailsLabel} className="max-w-2xl space-y-2 text-sm">
        <Row label={COPY.fundedBy}>
          {coupon.funding === 'platform' || coupon.sellerId === null ? (
            COUPON_FUNDING_LABELS.platform
          ) : (
            <Link href={sellerPath(coupon.sellerId)} className={LINK}>
              {sellerName(coupon.sellerId) ?? COPY.shortId(coupon.sellerId)}
            </Link>
          )}
        </Row>
        <Row label={COPY.discount}>{discountText(coupon)}</Row>
        <Row label={COPY.minimum}>{formatMoney(coupon.minItemsSubtotal)}</Row>
        <Row label={COPY.appliesTo}>
          {scopeText(coupon, {
            allLabel: isSellers ? COUPON_SCOPE_LABELS.seller.seller : COUPON_SCOPE_LABELS.admin.all,
            sellerName,
            categories,
          })}
        </Row>
        <Row label={COPY.valid}>
          {COPY.validRange(formatDateTime(coupon.startsAt), formatDateTime(coupon.endsAt))}
        </Row>
        <Row label={COPY.usesLabel}>{COPY.uses(coupon.redemptionCount, coupon.globalLimit)}</Row>
        <Row label={COPY.perCustomer}>{coupon.perCustomerLimit}</Row>
        <Row label={COPY.createdLabel}>{formatDateTime(coupon.createdAt)}</Row>
        {coupon.adminBlockReason === null ? null : (
          <Row label={COPY.blockReason}>{coupon.adminBlockReason}</Row>
        )}
      </dl>

      {isSellers ? (
        <p className="text-sm text-muted-foreground">{COPY.readOnly}</p>
      ) : (
        <CouponForm key={coupon.updatedAt} mode="edit" coupon={coupon} />
      )}

      <Redemptions rows={coupon.redemptions} />

      {dialog === 'block' ? <BlockDialog coupon={coupon} onClose={close} /> : null}
      {dialog === 'unblock' ? <UnblockDialog coupon={coupon} onClose={close} /> : null}
    </div>
  );
}

function Redemptions({ rows }: { readonly rows: readonly Redemption[] }) {
  const columns: readonly DataTableColumn<Redemption>[] = [
    {
      id: 'order',
      header: COPY.redemptionColumns.order,
      cell: (row) => (
        <Link href={orderPath(row.orderId)} className={LINK}>
          {COPY.orderLink(row.orderId)}
        </Link>
      ),
    },
    {
      id: 'customer',
      header: COPY.redemptionColumns.customer,
      cell: (row) => (
        <Link href={customerPath(row.customerId)} className={LINK}>
          {COPY.shortId(row.customerId)}
        </Link>
      ),
    },
    {
      id: 'discount',
      header: COPY.redemptionColumns.discount,
      align: 'end',
      cell: (row) => formatMoney(row.discountTotal),
    },
    {
      id: 'status',
      header: COPY.redemptionColumns.status,
      cell: (row) => REDEMPTION_STATUS_LABELS[row.status],
    },
    { id: 'date', header: COPY.redemptionColumns.date, cell: (row) => formatDateTime(row.createdAt) },
  ];
  return (
    <section aria-labelledby="coupon-redemptions-heading" className="space-y-3">
      <h2 id="coupon-redemptions-heading" className="text-lg font-semibold">
        {COPY.redemptionsHeading}
      </h2>
      <DataTable
        caption={COPY.redemptionsCaption}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.orderId}
        empty={<p className="text-sm text-muted-foreground">{COPY.noRedemptions}</p>}
        hasMore={false}
        loadingMore={false}
        onLoadMore={() => undefined}
      />
    </section>
  );
}

/** Reads the coupon again after a block change, or when it changed meanwhile. */
function useCouponRefresh(coupon: Coupon) {
  const queryClient = useQueryClient();
  return {
    refresh: () => {
      void queryClient.invalidateQueries({ queryKey: couponKeys.detail(coupon.id) });
      void queryClient.invalidateQueries({ queryKey: couponKeys.lists() });
    },
    /** `COUPON_BLOCK_INVALID_STATUS` / `COUPON_NOT_FOUND`: refetch and explain (spec 03 AD-37). */
    stale: (error: unknown): boolean =>
      isApiError(error, 'COUPON_BLOCK_INVALID_STATUS') || isApiError(error, 'COUPON_NOT_FOUND'),
  };
}

const blockSchema = z.object({ reason: fields.trimmedString(3, 500) });
type BlockValues = z.input<typeof blockSchema>;

function BlockDialog({ coupon, onClose }: { readonly coupon: Coupon; readonly onClose: () => void }) {
  const { refresh, stale } = useCouponRefresh(coupon);
  const failure = useSubmitFailure();
  const form = useForm<BlockValues, unknown, z.output<typeof blockSchema>>({
    resolver: zodResolver(blockSchema),
    mode: 'onBlur',
    defaultValues: { reason: '' },
  });

  const confirm = async () => {
    failure.clear();
    let reason: string | undefined;
    await form.handleSubmit((values) => {
      reason = values.reason;
    })();
    if (reason === undefined) throw new Error('invalid');
    try {
      await blockCoupon(coupon.id, reason);
      refresh();
      toast({ title: COPY.blockedToast(coupon.code) });
    } catch (error) {
      if (stale(error)) {
        refresh();
        toast({ title: COPY.changed, tone: 'destructive' });
        return;
      }
      failure.fail(error);
      throw error;
    }
  };

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.blockTitle}
      description={COPY.blockConfirm}
      confirmLabel={COPY.block}
      destructive
      onConfirm={confirm}
    >
      <form
        noValidate
        className="space-y-3"
        onSubmit={(event) => {
          // Enter in the reason must not submit: the dialog's button confirms.
          event.preventDefault();
        }}
      >
        {failure.message === null ? null : (
          <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
        )}
        <Field
          control={form.control}
          name="reason"
          label={COPY.reason}
          required
          render={({ field, controlProps }) => <Textarea {...field} {...controlProps} rows={3} />}
        />
      </form>
    </ConfirmDialog>
  );
}

function UnblockDialog({ coupon, onClose }: { readonly coupon: Coupon; readonly onClose: () => void }) {
  const { refresh, stale } = useCouponRefresh(coupon);
  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={COPY.unblockTitle}
      description={COPY.unblockConfirm}
      confirmLabel={COPY.unblock}
      onConfirm={async () => {
        try {
          await unblockCoupon(coupon.id);
          refresh();
          toast({ title: COPY.unblockedToast(coupon.code), tone: 'success' });
        } catch (error) {
          if (stale(error)) {
            refresh();
            toast({ title: COPY.changed, tone: 'destructive' });
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
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
