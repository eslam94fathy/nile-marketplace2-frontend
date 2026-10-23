import { unwrap, type Schema } from '@nile/api';
import type { AuthScreensApi } from '@nile/auth-screens';
import { browserApi } from '@/lib/browser-api';

// Public auth operations proxied by this app's BFF (design 02 §3.1). Sign-in and email verification go to the
// auth routes instead (@nile/auth/client), because they create the session.

export async function registerCustomer(body: Schema<'RegisterCustomerDto'>): Promise<void> {
  await unwrap(browserApi.POST('/api/v1/auth/register/customer', { body }));
}

/** Calls the shared screens make; the answers never reveal whether an email exists (spec 01 SF-12, SF-13). */
export const authScreensApi: AuthScreensApi = {
  async resendVerificationCode(email) {
    await unwrap(browserApi.POST('/api/v1/auth/email/resend-otp', { body: { email } }));
  },
  async requestPasswordReset(email) {
    await unwrap(browserApi.POST('/api/v1/auth/password/forgot', { body: { email } }));
  },
  async resetPassword(body) {
    await unwrap(browserApi.POST('/api/v1/auth/password/reset', { body }));
  },
};
