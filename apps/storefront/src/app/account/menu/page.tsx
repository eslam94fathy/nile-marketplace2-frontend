import type { Metadata } from 'next';
import { PageHeader } from '@nile/ui';
import { ACCOUNT_NAV_COPY, AccountMenu } from '@/features/account';
import { requireSession } from '@/lib/dal';

export const metadata: Metadata = { title: ACCOUNT_NAV_COPY.menuTitle };

/** Account menu page for phones (SF-Q-13): every account section in one list. */
export default async function AccountMenuPage() {
  await requireSession();
  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader title={ACCOUNT_NAV_COPY.menuTitle} />
      <AccountMenu />
    </div>
  );
}
