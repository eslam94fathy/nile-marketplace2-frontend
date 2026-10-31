'use client';

import {
  formatDate,
  formatDateTime,
  formatMoney,
  maxMoney,
  moneyGreaterThan,
  moneyShare,
  RETURN_STATUS_LABELS,
  SELLER_ORDER_STATUS_LABELS,
  type ReturnStatus,
  type SellerOrderStatus,
} from '@nile/domain';
import { Button, ErrorState, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { DEFAULT_RETURN_TAB, returnTabOf } from '@/features/returns';
import { ORDERS_AWAITING_PAYMENT_PATH, ROUTES, sellerPath, SUPPORT_SLA_PATH } from '@/lib/routes';
import { dashboardFiguresOptions, type DashboardFigures as Figures } from '../api';
import { DASHBOARD_COPY as COPY } from '../copy';

const HEADING_ID = 'dashboard-figures';
const LINK_CLASS = 'font-medium text-primary underline-offset-4 hover:underline';

/**
 * The only open seller-order status with an AD-14 filter that matches it: an order awaits payment exactly while
 * its seller orders do. AD-14 filters by order status, so the other counts have no link (TM1-Q1).
 */
const SELLER_ORDER_STATUS_LINKS: Partial<Record<SellerOrderStatus, Route>> = {
  pending_payment: ORDERS_AWAITING_PAYMENT_PATH,
};

/** An open return count links to the AD-32 tab that lists its status (TM7-Q6). */
function returnStatusLink(status: ReturnStatus): Route {
  const tab = returnTabOf(status);
  return tab === DEFAULT_RETURN_TAB ? ROUTES.returns : `${ROUTES.returns}?tab=${tab}`;
}

interface Figure {
  readonly label: string;
  readonly value: string;
  readonly href?: Route | undefined;
}

/** A labelled list of figures; the label is the link when the figure has a matching list. */
function FigureList({ figures }: { readonly figures: readonly Figure[] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {figures.map(({ label, value, href }) => (
        <div key={label} className="flex justify-between gap-4 py-1.5">
          <dt>
            {href === undefined ? (
              label
            ) : (
              <Link href={href} className={LINK_CLASS}>
                {label}
              </Link>
            )}
          </dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FigureCard({
  title,
  hint,
  children,
}: {
  readonly title: string;
  readonly hint?: string;
  readonly children: ReactNode;
}) {
  const headingId = `figures-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2 rounded-lg border border-border p-4">
      <h3 id={headingId} className="font-semibold">
        {title}
      </h3>
      {hint === undefined ? null : <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}

const count = (value: number) => String(value);

/** A bar for one amount, scaled to the largest amount of the table; the table cell is the accessible value. */
function Bar({
  value,
  max,
  tone,
}: {
  readonly value: string;
  readonly max: string;
  readonly tone: 'placed' | 'delivered';
}) {
  return (
    <svg aria-hidden="true" focusable="false" className="mt-1 block h-1.5 w-full" preserveAspectRatio="none">
      {moneyGreaterThan(value, '0') ? (
        <rect
          width={`${moneyShare(value, max)}%`}
          height="100%"
          rx="2"
          className={tone === 'placed' ? 'fill-primary' : 'fill-success'}
        />
      ) : null}
    </svg>
  );
}

/** Sales per Cairo day, most recent first: the table is the source, the bars only repeat it (FR2-Q6). */
function SalesTable({ gmv }: { readonly gmv: Figures['gmv'] }) {
  const max = maxMoney(gmv.flatMap((day) => [day.placed, day.delivered]));
  const days = [...gmv].reverse();
  return (
    <div className="max-h-96 overflow-y-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{COPY.salesCaption}</caption>
        <thead className="sticky top-0 bg-background text-left text-muted-foreground">
          <tr>
            <th scope="col" className="py-1.5 pr-4 font-medium">
              {COPY.salesDay}
            </th>
            <th scope="col" className="w-2/5 py-1.5 pr-4 font-medium">
              {COPY.salesPlaced}
            </th>
            <th scope="col" className="w-2/5 py-1.5 font-medium">
              {COPY.salesDelivered}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {days.map((day) => (
            <tr key={day.day}>
              <th scope="row" className="py-1.5 pr-4 text-left font-normal whitespace-nowrap">
                {formatDate(day.day)}
              </th>
              <td className="py-1.5 pr-4 tabular-nums">
                {formatMoney(day.placed)}
                <Bar value={day.placed} max={max} tone="placed" />
              </td>
              <td className="py-1.5 tabular-nums">
                {formatMoney(day.delivered)}
                <Bar value={day.delivered} max={max} tone="delivered" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FiguresGrid({ figures }: { readonly figures: Figures }) {
  const sellerOrders = Object.entries(figures.orders.byStatus) as [SellerOrderStatus, number][];
  const returns = Object.entries(figures.returns.byStatus) as [ReturnStatus, number][];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <FigureCard title={COPY.ordersTitle}>
        <FigureList
          figures={[
            { label: COPY.placedToday, value: count(figures.orders.placedToday) },
            { label: COPY.placedLast7Days, value: count(figures.orders.placedLast7Days) },
          ]}
        />
        <h4 className="pt-2 text-sm font-medium text-muted-foreground">{COPY.openSellerOrders}</h4>
        <FigureList
          figures={sellerOrders.map(([status, value]) => ({
            label: SELLER_ORDER_STATUS_LABELS.admin[status],
            value: count(value),
            href: SELLER_ORDER_STATUS_LINKS[status],
          }))}
        />
      </FigureCard>
      <div className="lg:col-span-2">
        <FigureCard title={COPY.salesTitle}>
          <SalesTable gmv={figures.gmv} />
        </FigureCard>
      </div>
      <FigureCard title={COPY.topSellersTitle} hint={COPY.topSellersHint}>
        {figures.topSellers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{COPY.noTopSellers}</p>
        ) : (
          <ol className="divide-y divide-border text-sm">
            {figures.topSellers.map((seller) => (
              <li key={seller.sellerId} className="flex justify-between gap-4 py-1.5">
                <Link href={sellerPath(seller.sellerId)} className={LINK_CLASS}>
                  {seller.businessName}
                </Link>
                <span className="tabular-nums">{formatMoney(seller.deliveredGmv)}</span>
              </li>
            ))}
          </ol>
        )}
      </FigureCard>
      <FigureCard title={COPY.sellersTitle}>
        <FigureList
          figures={[
            {
              label: COPY.pendingApproval,
              value: count(figures.sellers.pendingApproval),
              href: ROUTES.sellers,
            },
          ]}
        />
      </FigureCard>
      <FigureCard title={COPY.supportTitle}>
        <FigureList
          figures={[
            { label: COPY.supportOpen, value: count(figures.support.open) },
            {
              label: COPY.supportAwaitingAdmin,
              value: count(figures.support.awaitingAdmin),
              href: ROUTES.support,
            },
            {
              label: COPY.supportSlaBreached,
              value: count(figures.support.slaBreached),
              href: SUPPORT_SLA_PATH,
            },
          ]}
        />
      </FigureCard>
      <FigureCard title={COPY.deliveryTitle}>
        <FigureList
          figures={[
            {
              label: COPY.awaitingAssignment,
              value: count(figures.delivery.awaitingAssignment),
              href: ROUTES.shipments,
            },
            { label: COPY.outForDelivery, value: count(figures.delivery.outForDelivery) },
            { label: COPY.returnsInProgress, value: count(figures.delivery.returnsInProgress) },
          ]}
        />
      </FigureCard>
      <FigureCard title={COPY.returnsTitle}>
        <FigureList
          figures={returns.map(([status, value]) => ({
            label: RETURN_STATUS_LABELS.admin[status],
            value: count(value),
            href: returnStatusLink(status),
          }))}
        />
      </FigureCard>
      <FigureCard title={COPY.financeTitle}>
        <FigureList
          figures={[
            { label: COPY.codOutstanding, value: formatMoney(figures.finance.codOutstanding) },
            { label: COPY.sellerPayable, value: formatMoney(figures.finance.sellerPayable) },
            { label: COPY.sellerPending, value: formatMoney(figures.finance.sellerPending) },
            { label: COPY.agentFeePayable, value: formatMoney(figures.finance.agentFeePayable) },
            { label: COPY.customerRefundPayable, value: formatMoney(figures.finance.customerRefundPayable) },
          ]}
        />
      </FigureCard>
    </div>
  );
}

/** AD-02 "Today": the API's aggregates as they are (no counts or totals of our own, spec 03 §7.4). */
export function DashboardFigures() {
  const query = useQuery(dashboardFiguresOptions());
  let body: ReactNode;
  if (query.isError && query.data === undefined)
    body = <ErrorState message={COPY.figuresFailed} onRetry={() => void query.refetch()} />;
  else if (query.data === undefined) body = <Skeleton className="h-64" />;
  else body = <FiguresGrid figures={query.data} />;
  return (
    <section aria-labelledby={HEADING_ID} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={HEADING_ID} className="text-lg font-semibold">
          {COPY.figuresTitle}
        </h2>
        {query.data === undefined ? null : (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{COPY.figuresFrom(formatDateTime(query.data.generatedAt))}</span>
            <Button
              variant="outline"
              size="sm"
              aria-label={COPY.refreshLabel}
              loading={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {COPY.refresh}
            </Button>
          </div>
        )}
      </div>
      {body}
    </section>
  );
}
