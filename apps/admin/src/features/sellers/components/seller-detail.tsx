'use client';

import { isApiError } from '@nile/api';
import {
  formatDate,
  formatDateTime,
  formatRatePercent,
  SELLER_STATUS_LABELS,
  type ActorRole,
} from '@nile/domain';
import {
  Badge,
  buttonVariants,
  DataTable,
  ErrorState,
  NotFoundScreen,
  PageHeader,
  SELLER_STATUS_TONES,
  Skeleton,
  StatusBadge,
  type DataTableColumn,
} from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { useActorLabel, useGovernorateName } from '@/features/lookups';
import { StoreProducts } from '@/features/products';
import { publicEnv } from '@/lib/env/public';
import { ownerAccountsPath, ROUTES, STOREFRONT_SELLER_SEARCH_PATH } from '@/lib/routes';
import { isSellerMissing, sellerQuery, type AdminSellerDetail } from '../api';
import { SELLERS_COPY as COPY } from '../copy';
import { CommissionForm } from './commission-form';
import { SellerActions } from './seller-actions';

type StatusEntry = AdminSellerDetail['statusHistory'][number];
type CommissionEntry = AdminSellerDetail['commissionHistory'][number];

/** The seller's own finance account type [SPEC 12]. */
const SELLER_ACCOUNT_TYPE = 'seller_payable';

/**
 * Who changed a seller's status (AD-Q-2): registration and re-apply are the seller's own steps; every other
 * transition is an admin's [VERIFIED backend `seller.service.ts`, `seller-admin.service.ts`].
 */
export function statusActorRole(entry: Pick<StatusEntry, 'fromStatus' | 'toStatus'>): ActorRole {
  return entry.fromStatus === null || entry.toStatus === 'pending_approval' ? 'seller' : 'admin';
}

export interface SellerDetailProps {
  readonly sellerId: string;
  readonly currentUserId: string;
}

/** AD-05 Seller: details, status actions, commission, status and commission histories. */
export function SellerDetail({ sellerId, currentUserId }: SellerDetailProps) {
  const seller = useQuery(sellerQuery(sellerId));
  if (seller.isError) {
    if (isSellerMissing(seller.error)) {
      return (
        <NotFoundScreen
          message={COPY.notFound}
          homeLink={
            <Link href={ROUTES.sellers} className={buttonVariants({ variant: 'outline' })}>
              {COPY.backToSellers}
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
          onRetry={() => void seller.refetch()}
          correlationId={isApiError(seller.error) ? (seller.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (seller.data === undefined) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-48 max-w-2xl" />
      </div>
    );
  }
  return <SellerContent seller={seller.data} currentUserId={currentUserId} />;
}

function SellerContent({
  seller,
  currentUserId,
}: {
  readonly seller: AdminSellerDetail;
  readonly currentUserId: string;
}) {
  const actor = useActorLabel(currentUserId);
  const governorates = useGovernorateName();
  const address = seller.pickupAddress;

  const statusColumns: readonly DataTableColumn<StatusEntry>[] = [
    {
      id: 'change',
      header: COPY.historyColumns.change,
      cell: (entry) =>
        entry.fromStatus === null
          ? `${COPY.registered}${COPY.arrow}${SELLER_STATUS_LABELS[entry.toStatus]}`
          : `${SELLER_STATUS_LABELS[entry.fromStatus]}${COPY.arrow}${SELLER_STATUS_LABELS[entry.toStatus]}`,
    },
    { id: 'reason', header: COPY.historyColumns.reason, cell: (entry) => entry.reason ?? COPY.never },
    {
      id: 'by',
      header: COPY.historyColumns.by,
      cell: (entry) => actor(entry.actorUserId, statusActorRole(entry)),
    },
    { id: 'date', header: COPY.historyColumns.date, cell: (entry) => formatDateTime(entry.createdAt) },
  ];
  const commissionColumns: readonly DataTableColumn<CommissionEntry>[] = [
    {
      id: 'change',
      header: COPY.historyColumns.change,
      cell: (entry) => `${formatRatePercent(entry.oldRate)}${COPY.arrow}${formatRatePercent(entry.newRate)}`,
    },
    { id: 'by', header: COPY.historyColumns.by, cell: (entry) => actor(entry.changedByUserId, 'admin') },
    { id: 'date', header: COPY.historyColumns.date, cell: (entry) => formatDateTime(entry.createdAt) },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={seller.businessName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge value={seller.status} labels={SELLER_STATUS_LABELS} tones={SELLER_STATUS_TONES} />
            <Badge tone={seller.emailVerified ? 'success' : 'warning'}>
              {seller.emailVerified ? COPY.emailVerified : COPY.emailNotVerified}
            </Badge>
          </span>
        }
      />
      <SellerActions seller={seller} />
      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="seller-details-heading" className="space-y-3">
          <h2 id="seller-details-heading" className="text-lg font-semibold">
            {COPY.detailsHeading}
          </h2>
          <dl className="space-y-2 text-sm">
            <Row label={COPY.email} value={seller.email} />
            <Row label={COPY.phone} value={seller.contactPhone} />
            <Row
              label={COPY.pickupAddress}
              value={[
                `${address.building} ${address.street}`,
                address.area,
                address.city,
                governorates.name(address.governorateId),
                ...(address.landmark === null ? [] : [address.landmark]),
              ].join(', ')}
            />
            <Row label={COPY.commission} value={formatRatePercent(seller.commissionRate)} />
            <Row label={COPY.created} value={formatDate(seller.createdAt)} />
            <Row
              label={COPY.approved}
              value={seller.approvedAt === null ? COPY.never : formatDate(seller.approvedAt)}
            />
            {seller.rejectionReason === null ? null : (
              <Row label={COPY.rejectionReason} value={seller.rejectionReason} />
            )}
          </dl>
        </section>
        <div className="space-y-8">
          <CommissionForm seller={seller} />
          <section aria-labelledby="seller-links-heading" className="space-y-2 text-sm">
            <h2 id="seller-links-heading" className="text-lg font-semibold">
              {COPY.linksHeading}
            </h2>
            <ul className="space-y-1">
              <li>
                <a
                  href={`${publicEnv.NEXT_PUBLIC_STOREFRONT_URL}${STOREFRONT_SELLER_SEARCH_PATH(seller.id)}`}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {COPY.viewInStore}
                </a>
              </li>
              <li>
                <Link
                  href={ownerAccountsPath(seller.id, SELLER_ACCOUNT_TYPE)}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {COPY.financeAccount}
                </Link>
              </li>
              <li className="text-muted-foreground">{COPY.ordersNote}</li>
            </ul>
          </section>
        </div>
      </div>
      <StoreProducts sellerId={seller.id} />
      <History title={COPY.statusHistory}>
        <DataTable
          caption={COPY.statusHistoryCaption}
          columns={statusColumns}
          rows={seller.statusHistory}
          getRowId={(entry) => `${entry.createdAt}-${entry.toStatus}`}
          empty={<p className="text-sm text-muted-foreground">{COPY.noHistory}</p>}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      </History>
      <History title={COPY.commissionHistory}>
        <DataTable
          caption={COPY.commissionHistoryCaption}
          columns={commissionColumns}
          rows={seller.commissionHistory}
          getRowId={(entry) => `${entry.createdAt}-${entry.newRate}`}
          empty={<p className="text-sm text-muted-foreground">{COPY.noHistory}</p>}
          hasMore={false}
          loadingMore={false}
          onLoadMore={() => undefined}
        />
      </History>
    </div>
  );
}

function History({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = `history-${title.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
