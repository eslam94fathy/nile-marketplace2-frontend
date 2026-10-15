import type { Metadata } from 'next';
import { INVITE_COPY, InviteForm } from '@/features/invite';

export const metadata: Metadata = { title: INVITE_COPY.title, referrer: 'no-referrer' };

/**
 * SF-20, the `INVITE_URL_BASE` of the backend (architecture §5.7). The token is read in the browser only, so
 * it is never part of the server render.
 */
export default function InvitePage() {
  return <InviteForm />;
}
