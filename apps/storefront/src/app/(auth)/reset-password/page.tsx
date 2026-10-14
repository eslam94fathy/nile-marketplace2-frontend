import type { Metadata } from 'next';
import { AUTH_COPY, ResetPasswordForm } from '@/features/auth';
import { codeSentParam, emailParam } from '@/lib/search-params';

export const metadata: Metadata = { title: AUTH_COPY.reset.title };

/** SF-14. */
export default async function ResetPasswordPage({ searchParams }: PageProps<'/reset-password'>) {
  const params = await searchParams;
  return <ResetPasswordForm email={emailParam(params)} codeSent={codeSentParam(params)} />;
}
