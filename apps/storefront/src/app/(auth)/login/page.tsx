import type { Metadata } from 'next';
import { AUTH_COPY, SignInForm } from '@/features/auth';
import { emailParam, noticeParam, returnToParam } from '@/lib/search-params';

export const metadata: Metadata = { title: AUTH_COPY.signIn.title };

/** SF-10. A signed-in visitor never gets here: proxy.ts sends them to `returnTo` or home. */
export default async function SignInPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  return (
    <SignInForm returnTo={returnToParam(params)} email={emailParam(params)} notice={noticeParam(params)} />
  );
}
