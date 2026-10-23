'use client';

import { isApiError } from '@nile/api';
import {
  buttonVariants,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Money,
  Notice,
  PageHeader,
  Skeleton,
} from '@nile/ui';
import Link from 'next/link';
import { useState } from 'react';
import { ROUTES } from '@/lib/routes';
import { CART_COPY } from '../copy';
import type { CartNotice } from '../notices';
import { useCart, useCartActions } from '../hooks';
import { CartLine } from './cart-line';

/**
 * SF-06 Cart: one group per seller, lines, the API's totals (never recomputed), checkout only without issues.
 * The cart shown is always the last one the API returned.
 */
export function CartView({ notice = null }: { readonly notice?: CartNotice | null }) {
  const cart = useCart();
  const { empty } = useCartActions();
  const [confirmEmpty, setConfirmEmpty] = useState(false);

  if (cart.isPending) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title={CART_COPY.title} />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (cart.isError) {
    return (
      <div className="space-y-6">
        <PageHeader title={CART_COPY.title} />
        <ErrorState
          message={CART_COPY.loadFailed}
          onRetry={() => void cart.refetch()}
          retrying={cart.isFetching}
          correlationId={isApiError(cart.error) ? (cart.error.correlationId ?? undefined) : undefined}
        />
      </div>
    );
  }

  const data = cart.data;
  if (data.sellers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={CART_COPY.title} />
        <EmptyState
          title={CART_COPY.empty}
          action={
            <Link href={ROUTES.home} className={buttonVariants({ variant: 'outline' })}>
              {CART_COPY.startShopping}
            </Link>
          }
        />
      </div>
    );
  }

  const canCheckout = !data.hasIssues;
  return (
    <div className="space-y-6">
      <PageHeader title={CART_COPY.title} />
      {notice === null ? null : <Notice>{CART_COPY.notices[notice]}</Notice>}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          {data.sellers.map((seller) => (
            <section
              key={seller.sellerId}
              aria-labelledby={`seller-${seller.sellerId}`}
              className="rounded-lg border border-border p-4"
            >
              <h2 id={`seller-${seller.sellerId}`} className="font-semibold">
                {CART_COPY.soldBy(seller.businessName)}
              </h2>
              <ul>
                {seller.items.map((line) => (
                  <CartLine key={line.id} line={line} />
                ))}
              </ul>
              <p className="flex justify-between border-t border-border pt-3 text-sm">
                <span>{CART_COPY.subtotal}</span>
                <Money value={seller.subtotal} className="font-medium" />
              </p>
            </section>
          ))}
        </div>
        <aside aria-label={CART_COPY.title} className="h-fit space-y-4 rounded-lg border border-border p-4">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt>{CART_COPY.items(data.itemCount)}</dt>
              <dd>
                <Money value={data.itemsTotal} className="font-semibold" />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>{CART_COPY.delivery}</dt>
              <dd className="text-muted-foreground">{CART_COPY.deliveryAtCheckout}</dd>
            </div>
          </dl>
          {data.hasIssues ? (
            <p className="text-sm text-muted-foreground">{CART_COPY.issuesNotCounted}</p>
          ) : null}
          {canCheckout ? (
            <Link href={ROUTES.checkout} className={buttonVariants({ className: 'w-full' })}>
              {CART_COPY.proceed}
            </Link>
          ) : (
            <div className="space-y-2">
              <button
                type="button"
                disabled
                className={buttonVariants({ className: 'w-full' })}
                aria-describedby="fix-issues"
              >
                {CART_COPY.proceed}
              </button>
              <p id="fix-issues" className="text-sm text-destructive">
                {CART_COPY.fixIssues}
              </p>
            </div>
          )}
          <button
            type="button"
            className={buttonVariants({ variant: 'outline', className: 'w-full' })}
            disabled={empty.isPending}
            onClick={() => {
              setConfirmEmpty(true);
            }}
          >
            {CART_COPY.emptyCart}
          </button>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title={CART_COPY.emptyConfirmTitle}
        description={CART_COPY.emptyConfirm}
        confirmLabel={CART_COPY.emptyConfirmAction}
        destructive
        onConfirm={() => empty.mutateAsync()}
      />
    </div>
  );
}
