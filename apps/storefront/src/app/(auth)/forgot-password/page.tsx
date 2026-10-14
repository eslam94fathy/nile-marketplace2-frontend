import type { Metadata } from 'next';
import { AUTH_COPY, ForgotPasswordForm } from '@/features/auth';
import { emailParam } from '@/lib/search-params';

export const metadata: Metadata = { title: AUTH_COPY.forgot.title };

/** SF-13. */
export default async function ForgotPasswordPage({ searchParams }: PageProps<'/forgot-password'>) {
  return <ForgotPasswordForm email={emailParam(await searchParams)} />;
}
