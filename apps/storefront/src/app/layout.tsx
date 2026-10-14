import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { APP } from '@/lib/app';

export const metadata: Metadata = {
  title: { default: APP.title, template: `%s | ${APP.title}` },
  // Placeholder until launch: nothing here should be indexed yet.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
