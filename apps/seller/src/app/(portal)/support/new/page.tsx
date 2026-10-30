import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'New ticket' };

/** SE-25 New ticket: linked from a blocked product since T-L1 (spec 02 §8.3), built in T-L6. */
export default async function NewSupportTicketPage() {
  await requireSession();
  return <PlaceholderScreen title="New ticket" task="T-L6" />;
}
