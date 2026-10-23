'use client';

import { unwrap } from '@nile/api';
import { formatMoney } from '@nile/domain';
import Link from 'next/link';
import { FINANCE_COPY, financeKeys } from '@/features/finance';
import { browserApi } from '@/lib/browser-api';
import { agentRemittancePath, ROUTES } from '@/lib/routes';
import { dashboardQueueOptions, QueueCard, useQueueCard } from '../queue-card';

/** AD-18 on the Agent COD cash tab, non-zero balances only. */
const SEE_ALL_HREF = `${ROUTES.financeAccounts}?type=agent_cod_cash&nonzero=1` as const;

/** AD-02 queue 4 (T-H11): agents holding COD cash, most first → AD-20 prefilled with the agent. */
export function AgentsHoldingCodQueue() {
  const card = useQueueCard(
    dashboardQueueOptions(financeKeys.dashboard(), (limit, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/finance/accounts', {
          params: {
            query: { limit, sort: '-balance', 'accountType[eq]': 'agent_cod_cash', 'balance[gt]': '0' },
          },
          signal,
        }),
      ),
    ),
  );
  return (
    <QueueCard
      title={FINANCE_COPY.queueTitle}
      seeAllHref={SEE_ALL_HREF}
      seeAllLabel={FINANCE_COPY.queueSeeAll}
      getRowId={(account) => account.id}
      renderRow={(account) => (
        <span className="flex flex-wrap justify-between gap-2">
          {account.ownerId === null ? (
            <span>{account.ownerName ?? FINANCE_COPY.none}</span>
          ) : (
            <Link
              href={agentRemittancePath(account.ownerId)}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {account.ownerName ?? FINANCE_COPY.shortId(account.ownerId)}
            </Link>
          )}
          <span className="text-muted-foreground">{formatMoney(account.balance)}</span>
        </span>
      )}
      {...card}
    />
  );
}
