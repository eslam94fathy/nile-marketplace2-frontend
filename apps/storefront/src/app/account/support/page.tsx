import type { Metadata } from 'next';
import { PlaceholderScreen } from '@nile/ui';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Help & support' };

/** SF-29 Support tickets: an account navigation entry since T-K6b (SF-Q-13), built in T-K7. */
export default async function SupportPage() {
  await requireSession();
  return <PlaceholderScreen title="Help & support" task="T-K7" />;
}
