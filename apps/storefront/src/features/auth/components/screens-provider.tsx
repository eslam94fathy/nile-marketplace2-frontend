'use client';

import { AuthScreensProvider, type AuthLinkProps, type AuthScreensConfig } from '@nile/auth-screens';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { publicEnv } from '@/lib/env/public';
import { AUTH_PATHS, ROUTES } from '@/lib/routes';
import { authScreensApi } from '../api';

// The storefront's settings for the shared sign-in screens (design 01 R-24). The screens build their links
// from these routes at runtime, so they are typed as `Route` here, in one place.

function AppLink({ href, className, children }: AuthLinkProps) {
  return (
    <Link href={href as Route} className={className}>
      {children}
    </Link>
  );
}

const OTHER_SITES: AuthScreensConfig['otherSites'] = {
  seller: { account: 'seller', site: 'seller', url: publicEnv.NEXT_PUBLIC_SELLER_URL },
  admin: { account: 'admin', site: 'admin', url: publicEnv.NEXT_PUBLIC_ADMIN_URL },
  delivery_agent: { account: 'delivery', site: 'delivery', url: publicEnv.NEXT_PUBLIC_AGENT_URL },
};

export function StorefrontAuthScreens({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const config = useMemo<AuthScreensConfig>(
    () => ({
      routes: ROUTES,
      authPaths: AUTH_PATHS,
      otherSites: OTHER_SITES,
      api: authScreensApi,
      navigate: (url) => {
        router.push(url as Route);
      },
      Link: AppLink,
    }),
    [router],
  );
  return <AuthScreensProvider config={config}>{children}</AuthScreensProvider>;
}
