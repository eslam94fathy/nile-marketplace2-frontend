import { createRouteGuard } from '@nile/auth/server';
import { guardConfig } from '@/lib/server/guard-config';

// First, optimistic layer of route protection (design 01 §4.4): no backend call; the DAL checks again.
// Also sets each page's CSP with a fresh nonce (T-I1); the static security headers come from next.config.ts.
export const proxy = createRouteGuard(guardConfig);

export const config = {
  // Pages only: not the BFF and auth routes, Next.js assets or files with an extension.
  matcher: ['/((?!api/|_next/static/|_next/image/|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
