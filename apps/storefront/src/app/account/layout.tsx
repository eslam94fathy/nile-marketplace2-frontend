import type { ReactNode } from 'react';
import { AccountFrame } from '@/features/account';

/** Account pages share the account navigation (SF-Q-13); each page still checks the session itself. */
export default function AccountLayout({ children }: { readonly children: ReactNode }) {
  return <AccountFrame>{children}</AccountFrame>;
}
