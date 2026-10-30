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
import { loadOrderChoices } from '../api';

/** Customers open tickets in every category but `seller_onboarding` (spec 01 SF-30). */
const CUSTOMER_CATEGORIES = ['order', 'payment', 'delivery', 'return', 'account', 'other'] as const;

// The shared support screens give back paths from this app's routes: typed as `Route` here, in one place (as
// the notifications provider).
function AppLink({ href, ...props }: SupportLinkProps) {
  return <Link href={href as Route} {...props} />;
}

/** The support screens' configuration for this app (design 01 R-56). */
export function SupportKeeper({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const config = useMemo<SupportScreensConfig>(
    () => ({
      api: browserApi,
      scope: APP.name,
      categories: CUSTOMER_CATEGORIES,
      routes: {
        list: supportListPath,
        newTicket: ROUTES.supportNew,
        ticket: supportTicketPath,
        order: orderPath,
      },
      navigate: (url) => {
        router.push(url as Route);
      },
      Link: AppLink,
      orderChoices: loadOrderChoices,
    }),
    [router],
  );
  return <SupportScreensProvider config={config}>{children}</SupportScreensProvider>;
}
