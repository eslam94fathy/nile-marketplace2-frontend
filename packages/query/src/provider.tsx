'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, Suspense, type ReactNode } from 'react';
import { getQueryClient } from './query-client';

// Development only: the devtools chunk is never loaded (or bundled) in production builds.
const Devtools =
  process.env.NODE_ENV === 'development'
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((module) => ({ default: module.ReactQueryDevtools })),
      )
    : null;

/** Wrap each app once, in its root layout's client boundary. */
export function QueryProvider({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools initialIsOpen={false} />
        </Suspense>
      )}
    </QueryClientProvider>
  );
}
