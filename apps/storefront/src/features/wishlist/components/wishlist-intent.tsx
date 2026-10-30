'use client';

import { toast } from '@nile/ui';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useHasSession } from '@/lib/use-has-session';
import { WISHLIST_PARAM } from '../api';
import { WISHLIST_COPY } from '../copy';
import { useWishlistToggle } from '../hooks';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * After a signed-out heart tap and sign-in (SF-Q-17): the page comes back with `?wishlist=<productId>`; the
 * product is saved once, "Saved to your wishlist." is shown, and the parameter leaves the URL (so Back or a
 * refresh never saves it again). Mounted once in the storefront shell.
 */
export function WishlistIntent() {
  const signedIn = useHasSession();
  const params = useSearchParams();
  const handled = useRef<string | null>(null);
  const toggle = useWishlistToggle({
    onSaved: () => {
      toast({ title: WISHLIST_COPY.saved, tone: 'success' });
    },
  });
  const productId = params.get(WISHLIST_PARAM);
  const { mutate } = toggle;

  useEffect(() => {
    if (productId === null) {
      handled.current = null;
      return;
    }
    if (!signedIn || handled.current === productId) return;
    handled.current = productId;
    // Without a navigation: the page doesn't need to render again for a parameter it never reads.
    const url = new URL(window.location.href);
    url.searchParams.delete(WISHLIST_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    if (UUID.test(productId)) mutate({ productId, saved: true });
  }, [signedIn, productId, mutate]);

  return null;
}
