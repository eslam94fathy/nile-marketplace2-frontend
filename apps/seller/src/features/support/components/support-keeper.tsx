'use client';

import {
  SupportScreensProvider,
  type SupportLinkProps,
  type SupportScreensConfig,
} from '@nile/support-screens';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { APP } from '@/lib/app';
import { browserApi } from '@/lib/browser-api';
import { orderPath, ROUTES, supportListPath, supportTicketPath } from '@/lib/routes';
import { loadSellerOrderChoices } from '../api';

/** Sellers open tickets in every category, `seller_onboarding` included (spec 02 SE-25). */
const SELLER_CATEGORIES = [
  'order',
  'payment',
  'delivery',
  'return',
  'account',
  'seller_onboarding',
  'other',
] as const;

// The shared support screens give back paths from this app's routes: typed as `Route` here, in one place.
function AppLink({ href, ...props }: SupportLinkProps) {
  return <Link href={href as Route} {...props} />;
}

/** The support screens' configuration for the seller portal (design 01 R-56). */
export function SupportKeeper({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const config = useMemo<SupportScreensConfig>(
    () => ({
      api: browserApi,
      scope: APP.name,
      categories: SELLER_CATEGORIES,
      routes: {
        list: supportListPath,
        newTicket: ROUTES.supportNew,
        ticket: supportTicketPath,
        // Seller tickets link a seller order: its page is SE-15.
        order: orderPath,
      },
      navigate: (url) => {
        router.push(url as Route);
      },
      Link: AppLink,
      orderChoices: loadSellerOrderChoices,
      linkKind: 'sellerOrder',
    }),
    [router],
  );
  return <SupportScreensProvider config={config}>{children}</SupportScreensProvider>;
}
