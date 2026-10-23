import 'server-only';
import { createApiClient, serverTransport, type ApiClient } from '@nile/api';
import { serverEnv } from '@/lib/env/server';

/**
 * The backend client for public data in Server Components: no session is read and no token is sent, so the
 * answers are the same for every visitor (design 01 R-6, §8). `revalidateSeconds` lets Next.js cache a call
 * in its data cache (e.g. the category tree, 5 min); without it, nothing is cached.
 */
export function publicServerApi(options: { revalidateSeconds?: number } = {}): ApiClient {
  const { revalidateSeconds } = options;
  return createApiClient(
    serverTransport({
      baseUrl: serverEnv().NILE_API_BASE_URL,
      fetch: (request) =>
        revalidateSeconds === undefined
          ? fetch(request, { cache: 'no-store' })
          : fetch(request, { next: { revalidate: revalidateSeconds } }),
    }),
  );
}
