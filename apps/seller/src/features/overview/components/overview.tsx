'use client';

import { Button, buttonVariants, PageHeader } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import { Check, Clock } from 'lucide-react';
import Link from 'next/link';
import { useId } from 'react';
import { BalanceCard } from '@/features/finance';
import { profileQuery, useSellerAccess } from '@/features/profile';
import { ReturnQueue } from '@/features/returns';
import { ROUTES } from '@/lib/routes';
import { OVERVIEW_COPY as COPY } from '../copy';
import { OrderQueue } from './order-queue';

/**
 * SE-06 Overview (split decided 2026-10-15): the pending-approval checklist, the two order queues (T-H4), the return queues (T-L3, SE-Q-11),
 * the balance card (T-H5) and the shortcuts. The status banner comes from the shell.
 */
export function Overview() {
  const { data: profile } = useQuery(profileQuery());
  return (
    <div className="space-y-8">
      <PageHeader title={COPY.title} />
      {profile?.status === 'pending_approval' ? <PendingChecklist /> : null}
      <OrderQueue queue="toConfirm" />
      <OrderQueue queue="returns" />
      <ReturnQueue queue="toDecide" />
      <ReturnQueue queue="toCheck" />
      <BalanceCard variant="overview" />
      <Shortcuts />
    </div>
  );
}

/** Only verified sellers can sign in, so the first step is always done [SPEC 05]. */
function PendingChecklist() {
  return (
    <ul aria-label={COPY.checklistLabel} className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <li className="flex items-center gap-2">
        <Check aria-hidden="true" className="size-4 text-success" />
        {COPY.emailVerified}
      </li>
      <li className="flex items-center gap-2">
        <Clock aria-hidden="true" className="size-4 text-muted-foreground" />
        {COPY.waitingForReview}
      </li>
    </ul>
  );
}

function Shortcuts() {
  const access = useSellerAccess();
  const reasonId = useId();
  return (
    <section aria-labelledby="shortcuts-heading" className="space-y-3">
      <h2 id="shortcuts-heading" className="text-lg font-semibold">
        {COPY.shortcutsHeading}
      </h2>
      <div className="flex flex-wrap gap-2">
        {access.catalog ? (
          <Link href={ROUTES.newProduct} className={buttonVariants()}>
            {COPY.addProduct}
          </Link>
        ) : (
          // Visible but disabled, with the banner's reason (spec 02 §2.2).
          <Button disabled aria-describedby={access.reason === null ? undefined : reasonId}>
            {COPY.addProduct}
          </Button>
        )}
        <Link href={ROUTES.orders} className={buttonVariants({ variant: 'outline' })}>
          {COPY.orders}
        </Link>
        <Link href={ROUTES.products} className={buttonVariants({ variant: 'outline' })}>
          {COPY.products}
        </Link>
      </div>
      {access.catalog || access.reason === null ? null : (
        <p id={reasonId} className="text-sm text-muted-foreground">
          {access.reason}
        </p>
      )}
    </section>
  );
}
