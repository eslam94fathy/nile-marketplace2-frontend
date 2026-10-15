'use client';

import { isApiError } from '@nile/api';
import { governoratesQuery } from '@nile/query';
import { ErrorState, Money, PageHeader, Skeleton, UI_COPY } from '@nile/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  addressesQuery,
  addressKeys,
  governorateById,
  isDeliverable,
  type Address,
  type Governorate,
} from '@/features/addresses';
import { CART_NOTICES, useCart } from '@/features/cart';
import { browserApi } from '@/lib/browser-api';
import { ROUTES } from '@/lib/routes';
import { CHECKOUT_COPY } from '../copy';
import { AddressPicker } from './address-picker';

/** The default address when it can be delivered to (spec 01 SF-07 §1 preselection), else none. */
function preselected(addresses: readonly Address[], governorates: readonly Governorate[]): string | null {
  const fallback = addresses.find((address) => address.isDefault);
  return fallback !== undefined && isDeliverable(governorateById(governorates, fallback.governorateId))
    ? fallback.id
    : null;
}

/**
 * SF-07 Checkout (T-F2 part): entry guard, delivery address, delivery fee. Payment, review, total and
 * "Place order" arrive with T-F3. Fees feed the total, so governorates are always fetched fresh here.
 */
export function CheckoutView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useCart();
  const addresses = useQuery(addressesQuery());
  const governorates = useQuery({ ...governoratesQuery(browserApi), staleTime: 0, refetchOnMount: 'always' });
  /** The shopper's own choice; undefined until they choose (the default is preselected meanwhile). */
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);

  const leaveFor =
    cart.data === undefined
      ? null
      : cart.data.sellers.length === 0
        ? ROUTES.cart
        : cart.data.hasIssues
          ? (`${ROUTES.cart}?notice=${CART_NOTICES.needsAttention}` as const)
          : null;

  useEffect(() => {
    if (leaveFor !== null) router.replace(leaveFor);
  }, [leaveFor, router]);

  const failed = [cart, addresses, governorates].find((query) => query.isError);
  if (failed !== undefined) {
    return (
      <div className="space-y-6">
        <PageHeader title={CHECKOUT_COPY.title} />
        <ErrorState
          message={CHECKOUT_COPY.loadFailed}
          onRetry={() => {
            void cart.refetch();
            void addresses.refetch();
            void governorates.refetch();
          }}
          correlationId={isApiError(failed.error) ? (failed.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }
  if (
    cart.data === undefined ||
    addresses.data === undefined ||
    governorates.data === undefined ||
    leaveFor !== null
  ) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={CHECKOUT_COPY.title} />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const list = addresses.data;
  const zones = governorates.data;
  const candidate = chosen === undefined ? preselected(list, zones) : chosen;
  const selected = list.find((address) => address.id === candidate);
  const selectedGovernorate = selected === undefined ? null : governorateById(zones, selected.governorateId);
  // A choice that stopped being valid (deleted, governorate no longer deliverable) is dropped.
  const deliveryFee = isDeliverable(selectedGovernorate) ? (selectedGovernorate?.deliveryFee ?? null) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={CHECKOUT_COPY.title} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="checkout-address" className="space-y-4">
          <h2 id="checkout-address" className="text-lg font-semibold">
            {CHECKOUT_COPY.addressHeading}
          </h2>
          <AddressPicker
            addresses={list}
            governorates={zones}
            selectedId={deliveryFee === null ? null : (selected?.id ?? null)}
            onSelect={setChosen}
            onGovernoratesStale={() => void governorates.refetch()}
            onCreated={(address) => {
              void queryClient.invalidateQueries({ queryKey: addressKeys.list() });
              if (isDeliverable(governorateById(zones, address.governorateId))) setChosen(address.id);
            }}
          />
        </section>
        <aside
          aria-labelledby="checkout-summary"
          className="h-fit space-y-4 rounded-lg border border-border p-4"
        >
          <h2 id="checkout-summary" className="font-semibold">
            {CHECKOUT_COPY.summaryHeading}
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>{CHECKOUT_COPY.itemsTotal(cart.data.itemCount)}</dt>
              <dd>
                <Money value={cart.data.itemsTotal} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>{CHECKOUT_COPY.deliveryFee}</dt>
              <dd>{deliveryFee === null ? CHECKOUT_COPY.noAddressYet : <Money value={deliveryFee} />}</dd>
            </div>
          </dl>
          <p className="rounded-lg border border-dashed border-input p-3 text-sm text-muted-foreground">
            {UI_COPY.placeholder('T-F3')}
          </p>
        </aside>
      </div>
    </div>
  );
}
