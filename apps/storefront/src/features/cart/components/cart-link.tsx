'use client';

import { ShoppingCart } from 'lucide-react';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { CART_COPY } from '../copy';
import { useCart } from '../hooks';

/**
 * Header cart button for a signed-in customer (spec 01 §2.2): link to the cart with a badge of `itemCount`
 * (lines without issues only [SPEC 08 CT-6]), hidden when 0 or while unknown.
 */
export function CartLink({ className }: { readonly className?: string }) {
  const { data } = useCart();
  const count = data?.itemCount ?? 0;
  return (
    <Link
      href={ROUTES.cart}
      aria-label={count === 0 ? CART_COPY.cartLink : CART_COPY.cartLinkWithCount(count)}
      className={className}
    >
      <span className="relative">
        <ShoppingCart aria-hidden="true" className="size-5" />
        {count === 0 ? null : (
          <span
            aria-hidden="true"
            className="absolute -top-2 -end-2 min-w-5 rounded-full bg-primary px-1 text-center text-xs leading-5 text-primary-foreground"
          >
            {count}
          </span>
        )}
      </span>
    </Link>
  );
}
