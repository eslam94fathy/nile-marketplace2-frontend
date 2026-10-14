import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { QueryProvider } from '@nile/query';
import { SkipLink, Toaster } from '@nile/ui';
import { StorefrontShell } from '@/components/shell/storefront-shell';
import { APP } from '@/lib/app';
import { inter } from '@/lib/fonts';
import './globals.css';

export const metadata: Metadata = {
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
          <StorefrontShell>{children}</StorefrontShell>
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
