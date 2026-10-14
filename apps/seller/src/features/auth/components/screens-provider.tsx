'use client';

import { AuthScreensProvider, type AuthLinkProps, type AuthScreensConfig } from '@nile/auth-screens';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { publicEnv } from '@/lib/env/public';
import { AUTH_PATHS, ROUTES } from '@/lib/routes';
import { authScreensApi } from '../api';
import { REGISTER_COPY } from '../copy';

// The seller app's settings for the shared sign-in screens (design 01 R-24). The screens build their links
// from these routes at runtime, so they are typed as `Route` here, in one place.

function AppLink({ href, className, children }: AuthLinkProps) {
  return (
    <Link href={href as Route} className={className}>
      {children}
    </Link>
  );
}

/** Spec 02 SE-01: "This is a {customer/admin/delivery} account. Please use the {store/admin/delivery} site." */
const OTHER_SITES: AuthScreensConfig['otherSites'] = {
  customer: { account: 'customer', site: 'store', url: publicEnv.NEXT_PUBLIC_STOREFRONT_URL },
  admin: { account: 'admin', site: 'admin', url: publicEnv.NEXT_PUBLIC_ADMIN_URL },
  delivery_agent: { account: 'delivery', site: 'delivery', url: publicEnv.NEXT_PUBLIC_AGENT_URL },
};

export function SellerAuthScreens({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const config = useMemo<AuthScreensConfig>(
    () => ({
      routes: { ...ROUTES, home: ROUTES.overview },
      authPaths: AUTH_PATHS,
      otherSites: OTHER_SITES,
      api: authScreensApi,
      navigate: (url) => {
        router.push(url as Route);
      },
      Link: AppLink,
      verifyNote: REGISTER_COPY.reviewNote,
    }),
    [router],
  );
  return <AuthScreensProvider config={config}>{children}</AuthScreensProvider>;
}
