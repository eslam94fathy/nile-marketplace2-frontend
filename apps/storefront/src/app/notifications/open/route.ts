import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env/public';
import { notificationOpenPath } from '@/lib/notification-links';

/**
 * A push notification's click (design 01 §15.5): the service worker opens `/notifications/open?link=<API link>`;
 * the link is mapped with this app's map and only ever redirects to a page of this app (CLAUDE.md §9.4).
 * The target page checks the session itself.
 */
export function GET(request: NextRequest) {
  const target = notificationOpenPath(request.nextUrl.searchParams.get('link'));
  const response = NextResponse.redirect(new URL(target, publicEnv.NEXT_PUBLIC_STOREFRONT_URL));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
