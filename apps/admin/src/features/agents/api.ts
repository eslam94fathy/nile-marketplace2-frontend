import { isApiError, unwrap, type Schema } from '@nile/api';
import { infiniteListOptions, queryKey } from '@nile/query';
import { queryOptions } from '@tanstack/react-query';
import { agentKeys, type AdminAgent } from '@/features/lookups';
import { browserApi } from '@/lib/browser-api';
import { agentApiQuery, type AgentFilters } from './lib/list-params';

// Delivery agents (spec 03 AD-09, AD-10, AD-11; design 02 §2.4 `agents.*`, §3.4 "Agent create / update …").
// Keys live with the lookups so assignments elsewhere can refresh every agent view.

export type CreateAgentBody = Schema<'CreateAgentDto'>;
export type UpdateAgentBody = Schema<'UpdateAgentDto'>;
export type FinanceAccount = Schema<'AccountDto'>;

const AGENTS_PAGE_SIZE = 20;
/** An agent has two accounts at most (`agent_cod_cash`, `agent_fee_payable`) [SPEC 12]. */
const AGENT_ACCOUNTS_LIMIT = 10;

export const agentFinanceKeys = {
  accounts: (agentId: string) => queryKey('admin', 'finance', 'accounts', { ownerId: agentId }),
};

export function agentsListOptions(filters: AgentFilters) {
  return infiniteListOptions({
    queryKey: agentKeys.list(filters),
    fetchPage: async (cursor, signal) =>
      unwrap(
        browserApi.GET('/api/v1/admin/delivery-agents', {
          params: {
            query: {
              limit: AGENTS_PAGE_SIZE,
              ...agentApiQuery(filters),
              ...(cursor === undefined ? {} : { cursor }),
            },
          },
          signal,
        }),
      ),
  });
}

/** AD-11 balances: the agent's finance accounts (COD cash held, fees owed). */
export function agentAccountsQuery(agentId: string) {
  return queryOptions({
    queryKey: agentFinanceKeys.accounts(agentId),
    queryFn: async ({ signal }) =>
      (
        await unwrap(
          browserApi.GET('/api/v1/admin/finance/accounts', {
            params: { query: { limit: AGENT_ACCOUNTS_LIMIT, 'ownerId[eq]': agentId } },
            signal,
          }),
        )
      ).data,
    // Finance data is read on every visit, never polled (DQ-9).
    staleTime: 0,
  });
}

/** No such agent, or not an agent id at all (the backend checks the id format first, as R-36). */
export function isAgentMissing(error: unknown): boolean {
  return isApiError(error, 'AGENT_NOT_FOUND') || isApiError(error, 'VALIDATION_FAILED');
}

const path = (agentId: string) => ({ params: { path: { agentId } } });

export async function createAgent(body: CreateAgentBody): Promise<AdminAgent> {
  return (await unwrap(browserApi.POST('/api/v1/admin/delivery-agents', { body }))).data;
}

/** Only changed fields; never an empty body (the caller sends nothing then). */
export async function updateAgent(agentId: string, body: UpdateAgentBody): Promise<AdminAgent> {
  return (
    await unwrap(browserApi.PATCH('/api/v1/admin/delivery-agents/{agentId}', { ...path(agentId), body }))
  ).data;
}

export async function activateAgent(agentId: string): Promise<AdminAgent> {
  return (await unwrap(browserApi.POST('/api/v1/admin/delivery-agents/{agentId}/activate', path(agentId))))
    .data;
}

export async function deactivateAgent(agentId: string): Promise<AdminAgent> {
  return (await unwrap(browserApi.POST('/api/v1/admin/delivery-agents/{agentId}/deactivate', path(agentId))))
    .data;
}
