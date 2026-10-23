import { AUTH_COPY, ForgotPasswordForm } from '@nile/auth-screens';
import { emailParam } from '@nile/auth-screens/params';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: AUTH_COPY.forgot.title };

/** spec 04 AG-01 (forgot password, as spec 01 SF-13). */
export default async function ForgotPasswordPage({ searchParams }: PageProps<'/forgot-password'>) {
  return <ForgotPasswordForm email={emailParam(await searchParams)} />;
}
