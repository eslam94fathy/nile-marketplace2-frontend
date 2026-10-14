import { returnToParam } from '@nile/auth-screens/params';
import type { Metadata } from 'next';
import { REGISTER_COPY, RegisterForm } from '@/features/auth';
import { AUTH_PATHS } from '@/lib/routes';

export const metadata: Metadata = { title: REGISTER_COPY.title };

/** SF-11. A signed-in visitor never gets here: proxy.ts sends them to `returnTo` or home. */
export default async function RegisterPage({ searchParams }: PageProps<'/register'>) {
  return <RegisterForm returnTo={returnToParam(await searchParams, AUTH_PATHS)} />;
}
