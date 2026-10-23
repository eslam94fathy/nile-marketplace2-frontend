import { AUTH_COPY, ResetPasswordForm } from '@nile/auth-screens';
import { codeSentParam, emailParam } from '@nile/auth-screens/params';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: AUTH_COPY.reset.title };

/** spec 03 AD-01 (reset password, as spec 01 SF-14). */
export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const params = await searchParams;
  return <ResetPasswordForm email={emailParam(params)} codeSent={codeSentParam(params)} />;
}
