'use client';

import { isApiError } from '@nile/api';
import { buttonVariants, Notice, toast } from '@nile/ui';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback } from 'react';
import { ROUTES } from '@/lib/routes';
import { productQuery, type SellerProduct } from '../api';
import { PRODUCTS_COPY as COPY } from '../copy';

/** Support category of the "Contact support" link (SE-Q-14). */
const BLOCKED_SUPPORT_CATEGORY = 'account';

/** SE-10 item 1: Nile blocked the product; "Contact support" opens SE-25 about it (SE-Q-14). */
export function ProductBlockedBanner({ product }: { readonly product: SellerProduct }) {
  if (!product.adminBlocked) return null;
  return (
    <Notice>
      <p>{COPY.blocked(product.adminBlockReason ?? '')}</p>
      <Link
        href={{
          pathname: ROUTES.supportNew,
          query: { category: BLOCKED_SUPPORT_CATEGORY, product: product.id },
        }}
        className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-3' })}
      >
        {COPY.contactSupport}
      </Link>
    </Notice>
  );
}

/**
 * `PRODUCT_BLOCKED` from any product write: the product is read again and the banner sentence shown as a toast
 * (spec 02 §8.3). Returns whether it handled the error.
 */
export function useProductBlockedHandler(productId: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (error: unknown): boolean => {
      if (!isApiError(error, 'PRODUCT_BLOCKED')) return false;
      void queryClient.query({ ...productQuery(productId), staleTime: 0 }).then(
        (product) => {
          toast({ title: COPY.blocked(product.adminBlockReason ?? ''), tone: 'destructive' });
        },
        () => undefined,
      );
      return true;
    },
    [productId, queryClient],
  );
}
