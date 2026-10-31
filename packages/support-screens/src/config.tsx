'use client';

import type { ApiClient } from '@nile/api';
import type { TicketCategory } from '@nile/domain';
import { createContext, use, type ReactNode } from 'react';
import type { AppScope, SupportTab } from './api';

// What each app gives the shared support screens (design 01 §15.1, R-56, the R-24 pattern). The screens stay
// free of Next.js: the app passes its typed browser client, routes, navigate and `Link`.

export interface SupportLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly 'aria-current'?: 'page' | 'true' | undefined;
  readonly children: ReactNode;
}

/** One order the new-ticket form offers (SF-30); `sellers` names the parcels a URL can link. */
export interface OrderChoice {
  readonly id: string;
  readonly orderNumber: string;
  readonly sellers?: readonly { readonly sellerOrderId: string; readonly businessName: string }[];
}

export interface SupportScreensConfig {
  /** The app's browser client (every call through its BFF). */
  readonly api: ApiClient;
  /** First query-key segment of this app's private data. */
  readonly scope: AppScope;
  /** The categories this role may open, in order (customers: all but `seller_onboarding`). */
  readonly categories: readonly TicketCategory[];
  readonly routes: {
    readonly list: (tab: SupportTab) => string;
    readonly newTicket: string;
    readonly ticket: (ticketId: string) => string;
    readonly order: (orderId: string) => string;
  };
  /** In-app navigation (the app's router). */
  readonly navigate: (url: string) => void;
  /** The app's `Link`, so in-app links stay client-side navigations. */
  readonly Link: (props: SupportLinkProps) => ReactNode;
  /**
   * The orders the new-ticket form offers, with the one from the URL even when it is older. Absent: an order is
   * linked only through the URL.
   */
  readonly orderChoices?: (
    selectedOrderId: string | null,
    signal: AbortSignal,
  ) => Promise<readonly OrderChoice[]>;
  readonly linkKind?: SupportLinkKind;
  /**
   * Whose screens these are: `user` (customers, sellers: `/support/tickets…`) or `admin` (the support console:
   * `/admin/support/tickets…`, internal notes shown and writable, the user's typing shown). Default `user`.
   */
  readonly audience?: SupportAudience;
}

export type SupportAudience = 'user' | 'admin';

/**
 * What the order select holds: an order (customers, `orderId` + the URL's parcel) or a seller order (sellers,
 * sent as `sellerOrderId` only, spec 02 SE-25, backend spec 16 §4.1). Default `order`.
 */
export type SupportLinkKind = 'order' | 'sellerOrder';

const SupportContext = createContext<SupportScreensConfig | null>(null);

export function SupportScreensProvider({
  config,
  children,
}: {
  readonly config: SupportScreensConfig;
  readonly children: ReactNode;
}) {
  return <SupportContext value={config}>{children}</SupportContext>;
}

export function useSupportConfig(): SupportScreensConfig {
  const config = use(SupportContext);
  if (config === null) throw new Error('Support screens need a <SupportScreensProvider> (design 01 R-56)');
  return config;
}
