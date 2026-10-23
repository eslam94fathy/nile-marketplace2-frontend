import { AUTH_COPY, SignInForm } from '@nile/auth-screens';
import { emailParam, noticeParam, returnToParam } from '@nile/auth-screens/params';
import type { Metadata } from 'next';
import { AUTH_PATHS } from '@/lib/routes';

export const metadata: Metadata = { title: AUTH_COPY.signIn.title };

/** SE-01. A signed-in seller never gets here: proxy.ts sends them to `returnTo` or the overview. */
export default async function SignInPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  return (
    <SignInForm
      returnTo={returnToParam(params, AUTH_PATHS)}
      email={emailParam(params)}
      notice={noticeParam(params)}
    />
  );
}
