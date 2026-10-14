import { AUTH_COPY, VerifyEmailForm } from '@nile/auth-screens';
import { codeSentParam, emailParam, noticeParam, returnToParam } from '@nile/auth-screens/params';
import type { Metadata } from 'next';
import { AUTH_PATHS } from '@/lib/routes';

export const metadata: Metadata = { title: AUTH_COPY.verify.title };

/** SE-03: after verifying, the seller lands on the overview, which shows the approval status. */
export default async function VerifyEmailPage({ searchParams }: PageProps<'/verify-email'>) {
  const params = await searchParams;
  return (
    <VerifyEmailForm
      email={emailParam(params)}
      returnTo={returnToParam(params, AUTH_PATHS)}
      notice={noticeParam(params)}
      codeSent={codeSentParam(params)}
    />
  );
}
