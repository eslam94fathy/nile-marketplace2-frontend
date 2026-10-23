'use client';

import { isApiError } from '@nile/api';
import { buttonVariants, cn, EmptyState, ErrorState, LoadMore, PageHeader, Skeleton } from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { InactiveGate, profileQuery, useInactiveOnError } from '@/features/profile';
import { ROUTES } from '@/lib/routes';
import { activeShipmentsOptions } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import { ACTIVE_TAB_PARAM, ACTIVE_TABS, activeTab, DEFAULT_ACTIVE_TAB, type ActiveTab } from '../lib/tabs';
import { ShipmentCard } from './shipment-card';

const TABS = Object.keys(ACTIVE_TABS) as ActiveTab[];

const tabHref = (tab: ActiveTab): Route =>
  tab === DEFAULT_ACTIVE_TAB ? ROUTES.shipments : `${ROUTES.shipments}?${ACTIVE_TAB_PARAM}=${tab}`;

/** AG-04 Active shipments: three tabs, oldest first, polled every 30 s while visible. */
export function ActiveShipments({ tab: tabParam }: { readonly tab: string | null }) {
  const tab = activeTab(tabParam);
  return (
    <div className="space-y-4">
      <PageHeader title={COPY.title} />
      <InactiveGate>
        <nav aria-label={COPY.tabsLabel}>
          <ul className="grid grid-cols-3 gap-2">
            {TABS.map((item) => (
              <li key={item}>
                <Link
                  href={tabHref(item)}
                  aria-current={item === tab ? 'page' : undefined}
                  className={cn(
                    buttonVariants({ variant: item === tab ? 'primary' : 'outline' }),
                    'min-h-12 w-full',
                  )}
                >
                  {COPY.tabs[item]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <ShipmentList key={tab} tab={tab} />
      </InactiveGate>
    </div>
  );
}

function ShipmentList({ tab }: { readonly tab: ActiveTab }) {
  const shipments = useInfiniteQuery(activeShipmentsOptions(tab));
  const profile = useQuery(profileQuery());
  useInactiveOnError(shipments.error);
  const rows = shipments.data?.pages.flatMap((page) => page.data) ?? [];

  if (shipments.isError) {
    return (
      <ErrorState
        message={COPY.listFailed}
        onRetry={() => void shipments.refetch()}
        correlationId={isApiError(shipments.error) ? (shipments.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  if (shipments.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-36" />
        <Skeleton className="h-36" />
      </div>
    );
  }
  if (rows.length === 0) {
    // Off shift with nothing at all to finish: say how to get work (spec 04 AG-04).
    const offShiftAndIdle = profile.data?.onShift === false && profile.data.activeShipmentCount === 0;
    return <EmptyState title={offShiftAndIdle ? COPY.offShiftEmpty : COPY.empty[tab]} />;
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {rows.map((shipment) => (
          <li key={shipment.id}>
            <ShipmentCard shipment={shipment} />
          </li>
        ))}
      </ul>
      <LoadMore
        hasMore={shipments.hasNextPage}
        loading={shipments.isFetchingNextPage}
        onLoadMore={() => void shipments.fetchNextPage()}
        loadedCount={rows.length}
      />
    </div>
  );
}
