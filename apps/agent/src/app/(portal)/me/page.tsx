import type { Metadata } from 'next';
import { MeView } from '@/features/profile';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: 'Me' };

/** AG-02 Me: available even while the agent is inactive (spec 04 §2.2). */
export default async function MePage() {
  await requireSession();
  return <MeView />;
}
