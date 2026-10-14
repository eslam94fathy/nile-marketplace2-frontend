import 'server-only';
import { createDal } from '@nile/auth/server';
import { guardConfig } from '@/lib/server/guard-config';

/**
 * Session checks for Server Components (architecture §5.5). Every protected page calls `requireSession()`
 * itself: proxy.ts only redirects optimistically.
 */
export const { readSession, requireSession } = createDal(guardConfig);
