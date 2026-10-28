import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@nile/query';
import { SkipLink, Toaster } from '@nile/ui';
import { StorefrontShell } from '@/components/shell/storefront-shell';
import { NotificationsKeeper } from '@/components/notifications/notifications-keeper';
import { RealtimeKeeper } from '@/components/realtime/realtime-keeper';
import { SessionKeeper } from '@/components/session/session-keeper';
import { APP } from '@/lib/app';
import { publicEnv } from '@/lib/env/public';
import { inter } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
  // Absolute canonical URLs (spec 01 SF-05 SEO) from this app's configured origin.
  metadataBase: new URL(publicEnv.NEXT_PUBLIC_STOREFRONT_URL),
  title: { default: APP.title, template: `%s | ${APP.title}` },
  // Placeholder until launch: nothing here should be indexed yet.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={inter.variable}>
      <body>
        <SkipLink />
        <QueryProvider>
          <RealtimeKeeper>
            <NotificationsKeeper>
              <StorefrontShell>{children}</StorefrontShell>
            </NotificationsKeeper>
          </RealtimeKeeper>
          <Toaster />
          <SessionKeeper />
        </QueryProvider>
      </body>
    </html>
  );
}
