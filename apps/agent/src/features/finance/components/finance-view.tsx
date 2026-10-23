'use client';

import { isApiError } from '@nile/api';
import { formatDateTime, formatMoney, isCalendarDay } from '@nile/domain';
import {
  buttonVariants,
  cn,
  EmptyState,
  ErrorState,
  Input,
  Label,
  LoadMore,
  PageHeader,
  Skeleton,
} from '@nile/ui';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Route } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId } from 'react';
import { InactiveGate, useInactiveOnError } from '@/features/profile';
import { ROUTES } from '@/lib/routes';
import {
  balancesQuery,
  entriesOptions,
  remittancesOptions,
  type AgentAccount,
  type DayRange,
  type LedgerEntry,
} from '../api';
import { FINANCE_COPY as COPY } from '../copy';

// AG-07 `/finance?tab=fees|cash|handins&from=&to=` (no or unknown tab = fees; the range applies to statements).

const TABS = ['fees', 'cash', 'handins'] as const;
type FinanceTab = (typeof TABS)[number];
const ACCOUNT_OF: Readonly<Record<Exclude<FinanceTab, 'handins'>, AgentAccount>> = {
  fees: 'fee',
  cash: 'cod',
};
/** The entry types each account can hold [SPEC 12 §1.2]; anything else is shown raw and reported. */
const EXPECTED: Readonly<Record<AgentAccount, readonly string[]>> = {
  fee: ['agent_fee_earned', 'agent_payout'],
  cod: ['cod_cash_collected', 'cod_cash_remitted'],
};

export type RawFinanceParams = Readonly<Record<string, string | readonly string[] | undefined>>;

const single = (value: string | readonly string[] | undefined) =>
  typeof value === 'string' ? value : undefined;
const day = (value: string | undefined) => (value !== undefined && isCalendarDay(value) ? value : null);

export function parseFinanceParams(params: RawFinanceParams): { tab: FinanceTab; range: DayRange } {
  const tab = single(params.tab);
  const from = day(single(params.from));
  const to = day(single(params.to));
  return {
    tab: (TABS as readonly string[]).includes(tab ?? '') ? (tab as FinanceTab) : 'fees',
    range: { from, to: from !== null && to !== null && to < from ? null : to },
  };
}

function financeHref(tab: FinanceTab, range: DayRange): Route {
  const query = new URLSearchParams();
  if (tab !== 'fees') query.set('tab', tab);
  if (tab !== 'handins') {
    if (range.from !== null) query.set('from', range.from);
    if (range.to !== null) query.set('to', range.to);
  }
  const text = query.toString();
  return text === '' ? ROUTES.finance : `${ROUTES.finance}?${text}`;
}

/** AG-07 Finance: what Nile owes the agent, the cash they hold, the two statements and the hand-ins. */
export function FinanceView({ params }: { readonly params: RawFinanceParams }) {
  const { tab, range } = parseFinanceParams(params);
  return (
    <div className="space-y-4">
      <PageHeader title={COPY.title} />
      <InactiveGate>
        <Balances />
        <nav aria-label={COPY.tabsLabel}>
          <ul className="grid grid-cols-3 gap-2">
            {TABS.map((item) => (
              <li key={item}>
                <Link
                  href={financeHref(item, range)}
                  aria-current={item === tab ? 'page' : undefined}
                  className={cn(
                    buttonVariants({ variant: item === tab ? 'primary' : 'outline' }),
                    'min-h-12 w-full',
                  )}
                >
                  {COPY.tabs[item]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {tab === 'handins' ? (
          <HandIns />
        ) : (
          <Statement key={tab} tab={tab} account={ACCOUNT_OF[tab]} range={range} />
        )}
      </InactiveGate>
    </div>
  );
}

function Balances() {
  const balances = useQuery(balancesQuery());
  useInactiveOnError(balances.error);
  if (balances.isError) {
    return (
      <ErrorState
        message={COPY.balancesFailed}
        onRetry={() => void balances.refetch()}
        correlationId={isApiError(balances.error) ? (balances.error.correlationId ?? undefined) : undefined}
      />
    );
  }
  if (balances.data === undefined) return <Skeleton className="h-40" />;
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2">
        <BalanceCard title={COPY.owedTitle} amount={balances.data.feePayable} help={COPY.owedHelp} />
        <BalanceCard title={COPY.cashTitle} amount={balances.data.codCashHeld} help={COPY.cashHelp} />
      </div>
      <p className="text-sm text-muted-foreground">{COPY.asyncNote}</p>
    </div>
  );
}

function BalanceCard({
  title,
  amount,
  help,
}: {
  readonly title: string;
  readonly amount: string;
  readonly help: string;
}) {
  return (
    <section className="space-y-1 rounded-lg border border-border p-4" aria-label={title}>
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <p className="text-2xl font-bold tabular-nums">{formatMoney(amount)}</p>
      <p className="text-sm text-muted-foreground">{help}</p>
    </section>
  );
}

const description = (entry: LedgerEntry): string =>
  Object.hasOwn(COPY.descriptions, entry.entryType)
    ? COPY.descriptions[entry.entryType as keyof typeof COPY.descriptions]
    : entry.entryType;

function Statement({
  tab,
  account,
  range,
}: {
  readonly tab: FinanceTab;
  readonly account: AgentAccount;
  readonly range: DayRange;
}) {
  const id = useId();
  const router = useRouter();
  const entries = useInfiniteQuery(entriesOptions(account, range));
  useInactiveOnError(entries.error);
  const rows = entries.data?.pages.flatMap((page) => page.data) ?? [];
  const unexpectedKey = rows
    .filter((entry) => !EXPECTED[account].includes(entry.entryType))
    .map((entry) => `${entry.entryType}:${entry.id}`)
    .join(',');

  useEffect(() => {
    if (unexpectedKey === '') return;
    // No client log sink until T-I4 (FQ-10, as R-42): the console keeps the trace. Type and id only.
    // eslint-disable-next-line no-console -- the only client-side report available before T-I4
    console.warn('Unexpected ledger entry types on an agent statement', unexpectedKey);
  }, [unexpectedKey]);

  let body;
  if (entries.isError) {
    body = (
      <ErrorState
        message={COPY.entriesFailed}
        onRetry={() => void entries.refetch()}
        correlationId={isApiError(entries.error) ? (entries.error.correlationId ?? undefined) : undefined}
      />
    );
  } else if (entries.isPending) {
    body = <Skeleton className="h-40" />;
  } else if (rows.length === 0) {
    body = <EmptyState title={COPY.noEntries} />;
  } else {
    body = (
      <div className="space-y-3">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {rows.map((entry) => (
            <li key={entry.id} className="flex items-start justify-between gap-3 p-4">
              <span className="space-y-0.5">
                <span className="block font-medium">{description(entry)}</span>
                <span className="block text-sm text-muted-foreground">{formatDateTime(entry.createdAt)}</span>
              </span>
              <span className="space-y-0.5 text-end">
                <span className="block font-semibold tabular-nums">
                  {entry.direction === 'credit' ? '+' : '−'}
                  {formatMoney(entry.amount)}
                </span>
                <span className="block text-sm text-muted-foreground">
                  {COPY.balanceAfter(formatMoney(entry.balanceAfter))}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <LoadMore
          hasMore={entries.hasNextPage}
          loading={entries.isFetchingNextPage}
          onLoadMore={() => void entries.fetchNextPage()}
          loadedCount={rows.length}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor={`${id}-from`}>{COPY.from}</Label>
          <Input
            id={`${id}-from`}
            type="date"
            className="h-12"
            value={range.from ?? ''}
            max={range.to ?? undefined}
            onChange={(event) => {
              router.replace(
                financeHref(tab, { ...range, from: event.target.value === '' ? null : event.target.value }),
              );
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-to`}>{COPY.to}</Label>
          <Input
            id={`${id}-to`}
            type="date"
            className="h-12"
            value={range.to ?? ''}
            min={range.from ?? undefined}
            onChange={(event) => {
              router.replace(
                financeHref(tab, { ...range, to: event.target.value === '' ? null : event.target.value }),
              );
            }}
          />
        </div>
      </div>
      {body}
    </div>
  );
}

function HandIns() {
  const remittances = useInfiniteQuery(remittancesOptions());
  useInactiveOnError(remittances.error);
  const rows = remittances.data?.pages.flatMap((page) => page.data) ?? [];
  if (remittances.isError) {
    return (
      <ErrorState
        message={COPY.handinsFailed}
        onRetry={() => void remittances.refetch()}
        correlationId={
          isApiError(remittances.error) ? (remittances.error.correlationId ?? undefined) : undefined
        }
      />
    );
  }
  if (remittances.isPending) return <Skeleton className="h-40" />;
  if (rows.length === 0) return <EmptyState title={COPY.noHandins} />;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-lg border border-border">
        {rows.map((remittance) => (
          <li key={remittance.id} className="flex items-start justify-between gap-3 p-4">
            <span className="space-y-0.5">
              <span className="block text-sm text-muted-foreground">
                {formatDateTime(remittance.createdAt)}
              </span>
              {remittance.note === null ? null : <span className="block">{remittance.note}</span>}
              <span className="block text-sm text-muted-foreground">{COPY.confirmedByAdmin}</span>
            </span>
            <span className="font-semibold tabular-nums">{formatMoney(remittance.amount)}</span>
          </li>
        ))}
      </ul>
      <LoadMore
        hasMore={remittances.hasNextPage}
        loading={remittances.isFetchingNextPage}
        onLoadMore={() => void remittances.fetchNextPage()}
        loadedCount={rows.length}
      />
    </div>
  );
}
