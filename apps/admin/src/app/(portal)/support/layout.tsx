import type { ReactNode } from 'react';
import { SupportKeeper } from '@/features/support';

/** The support pages share one configuration of the shared screens; each page still checks the session. */
export default function SupportLayout({ children }: { readonly children: ReactNode }) {
  return <SupportKeeper>{children}</SupportKeeper>;
}
