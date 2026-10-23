'use client';

import type { Schema } from '@nile/api';
import { createContext, use, type ReactNode } from 'react';

// What each app gives the shared screens (design 01 R-24). The screens stay free of Next.js, like @nile/ui
// (R-18): the app passes its routes, a client-side navigate and its typed `Link`, and the API calls that go
// through its own BFF.

export type UserRole = Schema<'AuthUserDto'>['role'];

export interface AuthRoutes {
  readonly home: string;
  readonly login: string;
  readonly forgotPassword: string;
  readonly resetPassword: string;
  /** Apps with self-registration only (storefront, seller). */
  readonly register?: string;
  readonly verifyEmail?: string;
}

/** Another role's site, for the wrong-app message: "This is a {account} account. Please use the {site} site." */
export interface OtherSite {
  readonly account: string;
  readonly site: string;
  readonly url: string;
}

export interface AuthScreensApi {
  readonly requestPasswordReset: (email: string) => Promise<void>;
  readonly resetPassword: (body: Schema<'ResetPasswordDto'>) => Promise<void>;
  /** Apps with self-registration only. */
  readonly resendVerificationCode?: (email: string) => Promise<void>;
}

export interface AuthLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
}

export interface AuthScreensConfig {
  readonly routes: AuthRoutes;
  /** Pages that are never a `returnTo` destination (the sign-in screens). */
  readonly authPaths: readonly string[];
  readonly otherSites: Readonly<Partial<Record<UserRole, OtherSite>>>;
  readonly api: AuthScreensApi;
  /** In-app navigation (the app's router). */
  readonly navigate: (url: string) => void;
  /** The app's `Link`, so in-app links stay client-side navigations. */
  readonly Link: (props: AuthLinkProps) => ReactNode;
  /**
   * Wrong-app wording without a link, for apps whose spec words it so (admin: "This isn't an admin account.",
   * spec 03 AD-01; agent: spec 04 AG-01). Used instead of `otherSites`.
   */
  readonly wrongAppMessage?: string;
  /** Extra line on the verify screen after registration (seller: review notice, spec 02 SE-02). */
  readonly verifyNote?: string;
}

const AuthScreensContext = createContext<AuthScreensConfig | null>(null);

export function AuthScreensProvider({
  config,
  children,
}: {
  readonly config: AuthScreensConfig;
  readonly children: ReactNode;
}) {
  return <AuthScreensContext value={config}>{children}</AuthScreensContext>;
}

export function useAuthScreens(): AuthScreensConfig {
  const config = use(AuthScreensContext);
  if (config === null) throw new Error('Sign-in screens need an <AuthScreensProvider> (design 01 R-24)');
  return config;
}

/** `path?a=b&c=d` from a path and parameters, skipping empty ones. */
export function withQuery(path: string, params: Readonly<Record<string, string | null | undefined>>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, value);
  }
  const text = query.toString();
  return text === '' ? path : `${path}?${text}`;
}
