'use client';

import { AuthScreensProvider, type AuthLinkProps, type AuthScreensConfig } from '@nile/auth-screens';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, type ReactNode } from 'react';
import { AUTH_PATHS, ROUTES } from '@/lib/routes';
import { authScreensApi } from '../api';

// The agent app's settings for the shared sign-in screens (design 01 R-24). The screens build their links
// from these routes at runtime, so they are typed as `Route` here, in one place.

function AppLink({ href, className, children }: AuthLinkProps) {
  return (
    <Link href={href as Route} className={className}>
      {children}
    </Link>
  );
}

/** spec 04 AG-01: any other role gets this sentence, without a link. */
const WRONG_APP_MESSAGE = "This isn't a delivery agent account.";

export function AgentAuthScreens({ children }: { readonly children: ReactNode }) {
  const router = useRouter();
  const config = useMemo<AuthScreensConfig>(
    () => ({
      routes: {
        home: ROUTES.shipments,
        login: ROUTES.login,
        forgotPassword: ROUTES.forgotPassword,
        resetPassword: ROUTES.resetPassword,
      },
      authPaths: AUTH_PATHS,
      otherSites: {},
      wrongAppMessage: WRONG_APP_MESSAGE,
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
