import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Support ticket' };

/** SF-31 Support ticket: a notification link target since T-J6 (spec 00 §12.5), built in T-K7. */
export default async function SupportTicketPage() {
  await requireSession();
  return <PlaceholderScreen title="Support ticket" task="T-K7" />;
}
