import { browserTransport, createApiClient } from '@nile/api';
import { BFF_ROUTE_PREFIX } from '@nile/auth/client';
import { publicEnv } from '@/lib/env/public';
import { sessionClient } from '@/lib/session-client';

/**
 * The API client for client components: every call goes through this app's BFF; a 401 UNAUTHENTICATED
 * refreshes the session once (serialised across tabs) and retries the call once (design 01 §5.2).
 */
export const browserApi = createApiClient(
  browserTransport({
    bffBaseUrl: `${publicEnv.NEXT_PUBLIC_ADMIN_URL}${BFF_ROUTE_PREFIX}`,
    onUnauthenticated: sessionClient.onUnauthenticated,
  }),
);
