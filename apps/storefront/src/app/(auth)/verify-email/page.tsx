import type { Metadata } from 'next';
import { AUTH_COPY, VerifyEmailForm } from '@/features/auth';
import { codeSentParam, emailParam, noticeParam, returnToParam } from '@/lib/search-params';

export const metadata: Metadata = { title: AUTH_COPY.verify.title };

/** SF-12. */
export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const params = await searchParams;
  return (
    <VerifyEmailForm
      email={emailParam(params)}
      returnTo={returnToParam(params)}
      notice={noticeParam(params)}
      codeSent={codeSentParam(params)}
    />
  );
}
