'use client';

import { isApiError } from '@nile/api';
import { Button, buttonVariants, FormAlert, Notice } from '@nile/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ROUTES } from '@/lib/routes';
import { availableFromError, isAmbiguousFailure } from '../api';
import { CART_COPY } from '../copy';
import { useAddToCart } from '../hooks';

function addErrorMessage(error: unknown): string {
  if (isAmbiguousFailure(error)) return CART_COPY.addErrors.ambiguous;
  if (isApiError(error, 'VARIANT_NOT_PURCHASABLE')) return CART_COPY.addErrors.VARIANT_NOT_PURCHASABLE;
  if (isApiError(error, 'INSUFFICIENT_STOCK')) {
    const available = availableFromError(error);
    return available === null
      ? CART_COPY.addErrors.INSUFFICIENT_STOCK_UNKNOWN
      : CART_COPY.addErrors.INSUFFICIENT_STOCK(available);
  }
  if (isApiError(error, 'CART_ITEM_QUANTITY_LIMIT')) return CART_COPY.addErrors.CART_ITEM_QUANTITY_LIMIT;
  if (isApiError(error, 'CART_LINE_LIMIT_REACHED')) return CART_COPY.addErrors.CART_LINE_LIMIT_REACHED;
  return CART_COPY.addErrors.ambiguous;
}

export interface AddToCartProps {
  /** The selected, in-stock variant; null disables the button. */
  readonly variantId: string | null;
  readonly quantity: number;
  readonly label: string;
}

/**
 * SF-05-A1 for a signed-in customer: `POST /cart/items`, then "Added to cart" with "View cart" and "Continue
 * shopping". Product-related failures re-render the page from the server (fresh stock and options).
 */
export function AddToCart({ variantId, quantity, label }: AddToCartProps) {
  const router = useRouter();
  const add = useAddToCart();
  const [added, setAdded] = useState(false);

  const submit = () => {
    if (variantId === null) return;
    setAdded(false);
    add.mutate(
      { variantId, quantity },
      {
        onSuccess: () => {
          setAdded(true);
        },
        onError: (error) => {
          if (isApiError(error, 'VARIANT_NOT_PURCHASABLE', 'INSUFFICIENT_STOCK')) router.refresh();
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      <Button
        size="lg"
        className="w-full sm:w-auto"
        disabled={variantId === null}
        loading={add.isPending}
        onClick={submit}
      >
        {label}
      </Button>
      {add.isError ? <FormAlert>{addErrorMessage(add.error)}</FormAlert> : null}
      {added ? (
        <Notice tone="success">
          <p className="font-medium">{CART_COPY.added}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={ROUTES.cart} className={buttonVariants({ size: 'sm' })}>
              {CART_COPY.viewCart}
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdded(false);
              }}
            >
              {CART_COPY.continueShopping}
            </Button>
          </div>
        </Notice>
      ) : null}
    </div>
  );
}
