'use client';

import { cn } from '@nile/ui';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { RETURN_TO_PARAM, ROUTES } from '@/lib/routes';
import { useHasSession } from '@/lib/use-has-session';
import { WISHLIST_PARAM } from '../api';
import { WISHLIST_COPY } from '../copy';
import { useWishlistIds, useWishlistToggle } from '../hooks';

/** This page with `?wishlist=<productId>`: where sign-in comes back to, saving the product there (SF-Q-17). */
function returnToWithSave(productId: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set(WISHLIST_PARAM, productId);
  return `${url.pathname}${url.search}`;
}

export interface WishlistHeartProps {
  readonly productId: string;
  readonly className?: string;
}

/**
 * SF-23-A1 heart (product cards and the product page): a toggle button, `aria-pressed` from the saved ids.
 * Signed out it goes to sign-in and comes back with the product saved.
 */
export function WishlistHeart({ productId, className }: WishlistHeartProps) {
  const router = useRouter();
  const signedIn = useHasSession();
  const { ids } = useWishlistIds();
  const toggle = useWishlistToggle();
  const saved = ids.has(productId);

  const onClick = () => {
    if (!signedIn) {
      const query = new URLSearchParams({ [RETURN_TO_PARAM]: returnToWithSave(productId) });
      router.push(`${ROUTES.login}?${query.toString()}`);
      return;
    }
    toggle.mutate({ productId, saved: !saved });
  };

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? WISHLIST_COPY.remove : WISHLIST_COPY.save}
      // One change at a time per heart, so the last answer is the state shown.
      disabled={toggle.isPending}
      onClick={onClick}
      className={cn(
        'inline-flex size-10 items-center justify-center rounded-full border border-border bg-background hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60',
        className,
      )}
    >
      <Heart aria-hidden="true" className={cn('size-5', saved ? 'fill-destructive text-destructive' : '')} />
    </button>
  );
}
