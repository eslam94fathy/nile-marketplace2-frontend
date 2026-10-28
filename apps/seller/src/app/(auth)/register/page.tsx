import type { Metadata } from 'next';
import { connection } from 'next/server';
import { REGISTER_COPY, RegisterSellerForm } from '@/features/auth';

export const metadata: Metadata = { title: REGISTER_COPY.title };

/**
 * SE-02. A signed-in seller never gets here: proxy.ts sends them to the overview. Rendered per request for the
 * CSP nonce (R-50): reading nothing from the request, it would otherwise be prerendered without one.
 */
export default async function RegisterPage() {
  await connection();
  return <RegisterSellerForm />;
}
