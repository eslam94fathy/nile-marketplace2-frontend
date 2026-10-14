import type { Metadata } from 'next';
import { REGISTER_COPY, RegisterSellerForm } from '@/features/auth';

export const metadata: Metadata = { title: REGISTER_COPY.title };

/** SE-02. A signed-in seller never gets here: proxy.ts sends them to the overview. */
export default function RegisterPage() {
  return <RegisterSellerForm />;
}
