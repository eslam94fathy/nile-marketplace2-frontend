import { unwrap, type Schema } from '@nile/api';
import { signIn, verifyEmailAndSignIn } from '@nile/auth/client';
import { browserApi } from '@/lib/browser-api';

// Calls of the sign-in screens (design 02 §3.1). Registration, codes and password reset are public operations
// proxied by the BFF; sign-in and email verification go to the auth routes because they create the session.

export { signIn, verifyEmailAndSignIn };

export async function registerCustomer(body: Schema<'RegisterCustomerDto'>): Promise<void> {
  await unwrap(browserApi.POST('/api/v1/auth/register/customer', { body }));
}

/** Always the same generic answer, whether or not the email exists (spec 01 SF-12). */
export async function resendVerificationCode(email: string): Promise<void> {
  await unwrap(browserApi.POST('/api/v1/auth/email/resend-otp', { body: { email } }));
}

/** Always the same generic answer, whether or not the email exists (spec 01 SF-13). */
export async function requestPasswordReset(email: string): Promise<void> {
  await unwrap(browserApi.POST('/api/v1/auth/password/forgot', { body: { email } }));
}

export async function resetPassword(body: Schema<'ResetPasswordDto'>): Promise<void> {
  await unwrap(browserApi.POST('/api/v1/auth/password/reset', { body }));
}
