import { createSessionClient } from '@nile/auth/client';
import { clearPrivateQueries, getQueryClient } from '@nile/query';
import { isProtectedPath, LOGIN_PATH } from '@/lib/access';
import { APP } from '@/lib/app';
import { publicEnv } from '@/lib/env/public';

/** This page's refresh coordinator (design 01 §5.3): serialised refresh, proactive timer, cross-tab sign-out. */
export const sessionClient = createSessionClient({
  app: APP.name,
  loginPath: LOGIN_PATH,
  isProtectedPath,
  refreshSkewSeconds: publicEnv.NEXT_PUBLIC_REFRESH_SKEW_SECONDS,
  clearPrivateData: () => {
    clearPrivateQueries(getQueryClient());
  },
});
