import type { Metadata } from 'next';
import { AUTH_COPY, RegisterForm } from '@/features/auth';
import { returnToParam } from '@/lib/search-params';

export const metadata: Metadata = { title: AUTH_COPY.register.title };

/** SF-11. A signed-in visitor never gets here: proxy.ts sends them to `returnTo` or home. */
export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  return <RegisterForm returnTo={returnToParam(await searchParams)} />;
}
