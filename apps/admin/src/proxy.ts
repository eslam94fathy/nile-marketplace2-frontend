import { createRouteGuard } from '@nile/auth/server';
import { guardConfig } from '@/lib/server/guard-config';

// First, optimistic layer of route protection (design 01 §4.4): no backend call; the DAL checks again.
// Security headers and the CSP nonce join this file in T-I1.
export const proxy = createRouteGuard(guardConfig);

export const config = {
  // Pages only: not the BFF and auth routes, Next.js assets or files with an extension.
  matcher: ['/((?!api/|_next/static/|_next/image/|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
