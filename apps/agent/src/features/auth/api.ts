import { unwrap } from '@nile/api';
import type { AuthScreensApi } from '@nile/auth-screens';
import { browserApi } from '@/lib/browser-api';

// Public auth operations proxied by this app's BFF (design 02 §1 agent). There is no registration: accounts
// are invited (the invite landing is on the storefront, spec 01 SF-20).

/** Calls the shared screens make; the answers never reveal whether an email exists. */
export const authScreensApi: AuthScreensApi = {
  async requestPasswordReset(email) {
    await unwrap(browserApi.POST('/api/v1/auth/password/forgot', { body: { email } }));
  },
  async resetPassword(body) {
    await unwrap(browserApi.POST('/api/v1/auth/password/reset', { body }));
  },
};
