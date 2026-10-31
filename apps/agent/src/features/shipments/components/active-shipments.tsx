'use client';

import { isApiError } from '@nile/api';
import { PushPromptCard } from '@nile/notifications';
import { buttonVariants, cn, EmptyState, ErrorState, LoadMore, PageHeader, Skeleton } from '@nile/ui';
import { useRealtimeConnected } from '@nile/realtime';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { InactiveGate, profileQuery, useInactiveOnError } from '@/features/profile';
import { ROUTES } from '@/lib/routes';
import { activeShipmentsOptions } from '../api';
import { SHIPMENTS_COPY as COPY } from '../copy';
import {
  ACTIVE_TAB_PARAM,
  ACTIVE_TABS,
  activeTab,
  DEFAULT_ACTIVE_TAB,
  tabStreams,
  type ActiveTab,
} from '../lib/tabs';
import { ShipmentCard } from './shipment-card';

const TABS = Object.keys(ACTIVE_TABS) as ActiveTab[];

const tabHref = (tab: ActiveTab): Route =>
  tab === DEFAULT_ACTIVE_TAB ? ROUTES.shipments : `${ROUTES.shipments}?${ACTIVE_TAB_PARAM}=${tab}`;

/**
 * AG-04 Active shipments: three tabs by what the agent does next (deliveries and return pickups together,
 * AG-Q-7), oldest first, polled every 30 s while visible and no socket is connected.
 */
export function ActiveShipments({ tab: tabParam }: { readonly tab: string | null }) {
  const tab = activeTab(tabParam);
  return (
    <div className="space-y-4">
      <PageHeader title={COPY.title} />
      {/* Until dismissed or accepted: assignments are the agent's main trigger (AG-Q-8). */}
      <PushPromptCard text={COPY.pushCard} />
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
        <TabContent key={tab} tab={tab} />
      </InactiveGate>
    </div>
  );
}

/** One list per stream; "To the seller" shows its two streams as sections, each paged on its own (TN1-Q1). */
function TabContent({ tab }: { readonly tab: ActiveTab }) {
  const streams = tabStreams(tab);
  if (streams.length === 1) return <ShipmentList tab={tab} stream={0} />;
  return (
    <div className="space-y-6">
      {streams.map((_, stream) => {
        const heading = tab === 'seller' ? COPY.sellerSections[stream] : undefined;
        return (
          <section key={stream} aria-labelledby={`active-${tab}-${String(stream)}`} className="space-y-3">
            <h2 id={`active-${tab}-${String(stream)}`} className="text-base font-semibold">
              {heading}
            </h2>
            <ShipmentList tab={tab} stream={stream} />
          </section>
        );
      })}
    </div>
  );
}

function ShipmentList({ tab, stream }: { readonly tab: ActiveTab; readonly stream: number }) {
  const live = useRealtimeConnected();
  const shipments = useInfiniteQuery(activeShipmentsOptions(tab, stream, live));
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
    // A section of "To the seller" says which part is empty, in one line.
    if (tab === 'seller') {
      return <p className="text-sm text-muted-foreground">{COPY.sellerSectionsEmpty[stream]}</p>;
    }
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
