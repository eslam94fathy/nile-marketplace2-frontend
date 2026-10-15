'use client';

import { isApiError } from '@nile/api';
// useSubmitFailure only: FailureAlert needs the sign-in screens' provider, which checkout pages don't have.
import { useSubmitFailure } from '@nile/auth-screens';
import { formatMoney } from '@nile/domain';
import { governoratesQuery, useIdempotentMutation } from '@nile/query';
import { Button, ConfirmDialog, ErrorState, FormAlert, Money, PageHeader, Skeleton } from '@nile/ui';
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
import { cartKeys, CART_NOTICES, useCart } from '@/features/cart';
import { orderKeys } from '@/features/orders';
import { browserApi } from '@/lib/browser-api';
import { ROUTES } from '@/lib/routes';
import { placeOrder, type CheckoutBody, type PaymentMethod } from '../api';
import { CHECKOUT_COPY } from '../copy';
import { confirmationPath } from '../lib/constants';
import { expectedTotal } from '../lib/expected-total';
import { AddressPicker } from './address-picker';
import { OrderReview } from './order-review';
import { PaymentMethodPicker } from './payment-method';

/** The default address when it can be delivered to (spec 01 SF-07 §1 preselection), else none. */
function preselected(addresses: readonly Address[], governorates: readonly Governorate[]): string | null {
  const fallback = addresses.find((address) => address.isDefault);
  return fallback !== undefined && isDeliverable(governorateById(governorates, fallback.governorateId))
    ? fallback.id
    : null;
}

/** Place-order errors that send the shopper back to the cart (spec 01 SF-07-A1 errors). */
const BACK_TO_CART = {
  CART_EMPTY: ROUTES.cart,
  CART_HAS_ISSUES: `${ROUTES.cart}?notice=${CART_NOTICES.unavailable}`,
  INSUFFICIENT_STOCK: `${ROUTES.cart}?notice=${CART_NOTICES.stock}`,
} as const;

/**
 * SF-07 Checkout: entry guard, delivery address, payment method, review and "Place order". Fees feed the
 * total, so governorates are always fetched fresh here. Placing an order is idempotent: one key per body,
 * reused on every retry of that body, so double clicks and retries never create two orders.
 */
export function CheckoutView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const cart = useCart();
  const addresses = useQuery(addressesQuery());
  const governorates = useQuery({ ...governoratesQuery(browserApi), staleTime: 0, refetchOnMount: 'always' });
  /** The shopper's own choice; undefined until they choose (the default is preselected meanwhile). */
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  /** Set once the order exists: the emptied cart must not trigger the entry guard on the way out. */
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [totalChanged, setTotalChanged] = useState(false);
  const failure = useSubmitFailure(CHECKOUT_COPY.errors);

  const place = useIdempotentMutation({
    mutationFn: placeOrder,
    onSuccess: (result) => {
      const { order } = result;
      setPlacedOrderId(order.id);
      queryClient.setQueryData(orderKeys.detail(order.id), order);
      void queryClient.invalidateQueries({ queryKey: cartKeys.cart() });
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      // Only cash on delivery can be chosen until T-F4 adds the Kashier redirect.
      router.push(confirmationPath(order.id));
    },
  });

  const leaveFor =
    cart.data === undefined || placedOrderId !== null
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
  if (failed !== undefined && placedOrderId === null) {
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
    leaveFor !== null ||
    placedOrderId !== null
  ) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={CHECKOUT_COPY.title} />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  const basket = cart.data;
  const list = addresses.data;
  const zones = governorates.data;
  const candidate = chosen === undefined ? preselected(list, zones) : chosen;
  const selected = list.find((address) => address.id === candidate);
  const selectedGovernorate = selected === undefined ? null : governorateById(zones, selected.governorateId);
  // A choice that stopped being valid (deleted, governorate no longer deliverable) is dropped.
  const deliveryFee = isDeliverable(selectedGovernorate) ? (selectedGovernorate?.deliveryFee ?? null) : null;
  const total = expectedTotal(basket.itemsTotal, deliveryFee);
  const body: CheckoutBody | null =
    selected === undefined || deliveryFee === null || total === null || method === null
      ? null
      : { addressId: selected.id, paymentMethod: method, expectedTotal: total };

  const onPlaceFailed = async (error: unknown) => {
    const backTo = (Object.keys(BACK_TO_CART) as (keyof typeof BACK_TO_CART)[]).find((code) =>
      isApiError(error, code),
    );
    if (backTo !== undefined) {
      router.replace(BACK_TO_CART[backTo]);
      return;
    }
    if (isApiError(error, 'ORDER_TOTAL_CHANGED')) {
      // A new total is a new intent: confirmed again, sent with a new key (conventions §6).
      place.resetIntent();
      await Promise.all([cart.refetch(), governorates.refetch()]);
      setTotalChanged(true);
      return;
    }
    if (isApiError(error, 'ADDRESS_NOT_FOUND')) {
      setChosen(null);
      void addresses.refetch();
    }
    if (isApiError(error, 'GOVERNORATE_NOT_DELIVERABLE')) void governorates.refetch();
    failure.fail(error);
  };

  const submit = (next: CheckoutBody) => {
    failure.clear();
    place.mutate(next, { onError: (error) => void onPlaceFailed(error) });
  };

  return (
    <div className="space-y-6">
      <PageHeader title={CHECKOUT_COPY.title} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-8">
          <section aria-labelledby="checkout-address" className="space-y-4">
            <h2 id="checkout-address" className="text-lg font-semibold">
              {CHECKOUT_COPY.addressHeading}
            </h2>
            <AddressPicker
              addresses={list}
              governorates={zones}
              selectedId={deliveryFee === null ? null : (selected?.id ?? null)}
              onSelect={(addressId) => {
                failure.clear();
                setChosen(addressId);
              }}
              onGovernoratesStale={() => void governorates.refetch()}
              onCreated={(address) => {
                void queryClient.invalidateQueries({ queryKey: addressKeys.list() });
                if (isDeliverable(governorateById(zones, address.governorateId))) setChosen(address.id);
              }}
            />
          </section>
          <section aria-labelledby="checkout-payment" className="space-y-4">
            <h2 id="checkout-payment" className="text-lg font-semibold">
              {CHECKOUT_COPY.paymentHeading}
            </h2>
            <PaymentMethodPicker value={method} onChange={setMethod} />
          </section>
          <section aria-labelledby="checkout-review" className="space-y-4">
            <h2 id="checkout-review" className="text-lg font-semibold">
              {CHECKOUT_COPY.reviewHeading}
            </h2>
            <OrderReview cart={basket} />
          </section>
        </div>
        <aside
          aria-labelledby="checkout-summary"
          className="h-fit space-y-4 rounded-lg border border-border p-4 lg:sticky lg:top-4"
        >
          <h2 id="checkout-summary" className="font-semibold">
            {CHECKOUT_COPY.summaryHeading}
          </h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>{CHECKOUT_COPY.itemsTotal(basket.itemCount)}</dt>
              <dd>
                <Money value={basket.itemsTotal} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>{CHECKOUT_COPY.deliveryFee}</dt>
              <dd>{deliveryFee === null ? CHECKOUT_COPY.noAddressYet : <Money value={deliveryFee} />}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
              <dt>{CHECKOUT_COPY.total}</dt>
              <dd>{total === null ? CHECKOUT_COPY.noAddressYet : <Money value={total} />}</dd>
            </div>
          </dl>
          {failure.message === null ? null : (
            <FormAlert correlationId={failure.correlationId}>{failure.message}</FormAlert>
          )}
          <Button
            className="w-full"
            loading={place.isPending}
            disabled={body === null || failure.blocked}
            onClick={() => {
              if (body !== null) submit(body);
            }}
          >
            {place.isPending ? CHECKOUT_COPY.placing : CHECKOUT_COPY.placeOrder}
          </Button>
          {body === null ? (
            <p className="text-sm text-muted-foreground">{CHECKOUT_COPY.chooseToContinue}</p>
          ) : null}
        </aside>
      </div>
      <ConfirmDialog
        open={totalChanged && body !== null}
        onOpenChange={setTotalChanged}
        title={CHECKOUT_COPY.totalChanged.title}
        description={CHECKOUT_COPY.totalChanged.message(total === null ? '' : formatMoney(total))}
        confirmLabel={CHECKOUT_COPY.totalChanged.confirm}
        cancelLabel={CHECKOUT_COPY.totalChanged.cancel}
        onConfirm={() => {
          setTotalChanged(false);
          if (body !== null) submit(body);
        }}
      />
    </div>
  );
}
