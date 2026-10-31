'use client';

import { TICKET_CATEGORIES } from '@nile/domain';
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
import { orderPath, ROUTES, supportTicketPath } from '@/lib/routes';

// The shared support screens give back paths from this app's routes: typed as `Route` here, in one place.
function AppLink({ href, ...props }: SupportLinkProps) {
  return <Link href={href as Route} {...props} />;
}

/**
 * The shared support screens' configuration for the console (design 01 R-56): the admin endpoints, internal notes
 * and the user's typing (`audience: 'admin'`). Admins never open tickets, so "new ticket" is the list.
 */
export function SupportKeeper({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const config = useMemo<SupportScreensConfig>(
    () => ({
      api: browserApi,
      scope: APP.name,
      categories: TICKET_CATEGORIES,
      routes: {
        list: () => ROUTES.support,
        newTicket: ROUTES.support,
        ticket: supportTicketPath,
        order: orderPath,
      },
      navigate: (url) => {
        router.push(url as Route);
      },
      Link: AppLink,
      audience: 'admin',
    }),
    [router],
  );
  return <SupportScreensProvider config={config}>{children}</SupportScreensProvider>;
}
