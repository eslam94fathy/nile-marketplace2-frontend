import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Tickets' };

/** AD-28 Tickets: the dashboard's "Tickets waiting longest" links here since T-M1, built in T-M5. */
export default async function SupportPage() {
  await requireSession();
  return <PlaceholderScreen title="Tickets" task="T-M5" />;
}
