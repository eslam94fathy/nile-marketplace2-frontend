'use client';

import { formatDateTime, parseMoney } from '@nile/domain';
import { ErrorState, Money, Skeleton } from '@nile/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ROUTES } from '@/lib/routes';
import { balanceQuery, type SellerBalance } from '../api';
import { FINANCE_COPY as COPY } from '../copy';

/** No ledger entry yet: `"0.00"` with `updatedAt: null` (spec 02 SE-16, T-H5 acceptance). */
export const hasNoEarnings = (balance: SellerBalance): boolean =>
  balance.updatedAt === null && parseMoney(balance.balance).isZero();

export interface BalanceCardProps {
  /** `overview`: SE-06 item 4, links to the finance page; `finance`: SE-16 item 1 with the explanation. */
  readonly variant: 'overview' | 'finance';
}

/** "Nile owes you {balance}", read on every visit (DQ-9: it changes a few moments after a delivery). */
export function BalanceCard({ variant }: BalanceCardProps) {
  const balance = useQuery(balanceQuery());
  return (
    <section
      aria-labelledby={`balance-${variant}`}
      className="max-w-xl space-y-2 rounded-lg border border-border p-4"
    >
      <h2 id={`balance-${variant}`} className="text-sm font-medium text-muted-foreground">
        {COPY.owesYou}
      </h2>
      {balance.isError ? (
        <ErrorState message={COPY.balanceFailed} onRetry={() => void balance.refetch()} />
      ) : balance.data === undefined ? (
        <Skeleton className="h-8 w-40" />
      ) : hasNoEarnings(balance.data) ? (
        <p>{variant === 'overview' ? COPY.noEarningsOverview : COPY.noEarnings}</p>
      ) : (
        <>
          <p className="text-2xl font-semibold">
            <Money value={balance.data.balance} />
          </p>
          {balance.data.updatedAt === null ? null : (
            <p className="text-sm text-muted-foreground">
              {COPY.lastUpdated(formatDateTime(balance.data.updatedAt))}
            </p>
          )}
        </>
      )}
      {variant === 'finance' ? <p className="text-sm text-muted-foreground">{COPY.explanation}</p> : null}
      <p className="text-sm text-muted-foreground">{COPY.asyncNote}</p>
      {variant === 'overview' ? (
        <Link
          href={ROUTES.finance}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {COPY.viewFinance}
        </Link>
      ) : null}
    </section>
  );
}
