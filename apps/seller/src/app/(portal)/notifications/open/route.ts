import { NextResponse, type NextRequest } from 'next/server';
import { requireSession } from '@/lib/dal';
import { publicEnv } from '@/lib/env/public';
import { notificationOpenPath } from '@/lib/notification-links';

/**
 * A push notification's click (design 01 §15.5): the service worker opens `/notifications/open?link=<API link>`;
 * the link is mapped with this app's map and only ever redirects to a page of this app (CLAUDE.md §9.4).
 */
export async function GET(request: NextRequest) {
  await requireSession();
  const target = notificationOpenPath(request.nextUrl.searchParams.get('link'));
  const response = NextResponse.redirect(new URL(target, publicEnv.NEXT_PUBLIC_SELLER_URL));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
